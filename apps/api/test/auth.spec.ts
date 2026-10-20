import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  googleToken,
  insertEmployee,
  ownerPool,
  testEnv,
  uniqueEmail,
  WEB_ORIGIN,
} from './helpers.js';

const owner = ownerPool();
let app: NestExpressApplication;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
  await owner.end();
});

function sessionCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith('mowihr_session='));
  if (!cookie) throw new Error('no session cookie set');
  return cookie.split(';')[0]!;
}

async function lastAuditFor(email: string) {
  const { rows } = await owner.query(
    `SELECT action, metadata FROM audit_log WHERE metadata->>'email' = $1 ORDER BY id DESC LIMIT 1`,
    [email],
  );
  return rows[0];
}

describe('Google sign-in', () => {
  it('signs in an active employee of the domain and audits the login', async () => {
    const person = await insertEmployee(owner);
    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ credential: googleToken(person.email) })
      .expect(204);

    const cookie = sessionCookie(res);
    expect(res.headers['set-cookie']![0]).toMatch(/HttpOnly/);
    expect(res.headers['set-cookie']![0]).toMatch(/SameSite=Lax/);

    const me = await request(app.getHttpServer()).get('/me').set('Cookie', cookie).expect(200);
    expect(me.body).toMatchObject({ id: person.id, email: person.email, locale: 'es' });
    expect(me.body.roles).toEqual([{ role: 'employee', areaId: null }]);

    const { rows } = await owner.query(
      `SELECT action, actor_id FROM audit_log WHERE action = 'login' AND actor_id = $1`,
      [person.id],
    );
    expect(rows).toHaveLength(1);
  });

  it('matches the email case-insensitively', async () => {
    const person = await insertEmployee(owner);
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ credential: googleToken(person.email.toUpperCase(), { hostedDomain: 'MOWI.TEST' }) })
      .expect(204);
  });

  it.each([
    ['wrong_domain', { hostedDomain: 'gmail.com' }],
    ['wrong_domain', { hostedDomain: null }],
    ['email_not_verified', { emailVerified: false }],
  ] as const)('refuses %s and audits it', async (reason, overrides) => {
    const person = await insertEmployee(owner);
    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ credential: googleToken(person.email, overrides) })
      .expect(401);
    expect(res.body.message).toBe('Sign-in not allowed');
    expect(await lastAuditFor(person.email)).toEqual({
      action: 'login_failed',
      metadata: { reason, email: person.email },
    });
  });

  it('refuses an address whose suffix is not the domain even if hd matches', async () => {
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ credential: googleToken('someone@evil.example') })
      .expect(401);
  });

  it('refuses people who are not employees', async () => {
    const email = uniqueEmail('stranger');
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ credential: googleToken(email) })
      .expect(401);
    expect((await lastAuditFor(email))?.metadata.reason).toBe('unknown_employee');
  });

  it('refuses deactivated employees', async () => {
    const person = await insertEmployee(owner, { status: 'deactivated' });
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ credential: googleToken(person.email) })
      .expect(401);
    expect((await lastAuditFor(person.email))?.metadata.reason).toBe('deactivated');
  });

  it('refuses soft-deleted employees', async () => {
    const person = await insertEmployee(owner);
    await owner.query(`UPDATE employees SET deleted_at = now() WHERE id = $1`, [person.id]);
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ credential: googleToken(person.email) })
      .expect(401);
  });

  it('refuses tokens Google does not accept', async () => {
    await request(app.getHttpServer()).post('/auth/google').send({ credential: 'bad' }).expect(401);
  });

  it('validates the body', async () => {
    await request(app.getHttpServer()).post('/auth/google').send({}).expect(400);
  });
});

describe('sessions', () => {
  async function signIn(): Promise<{ cookie: string; id: string }> {
    const person = await insertEmployee(owner);
    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ credential: googleToken(person.email) })
      .expect(204);
    return { cookie: sessionCookie(res), id: person.id };
  }

  it('requires a session for non-public endpoints', async () => {
    await request(app.getHttpServer()).get('/me').expect(401);
    await request(app.getHttpServer()).get('/me').set('Cookie', 'mowihr_session=nope').expect(401);
  });

  it('keeps health public', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });

  it('logs out by revoking the session', async () => {
    const { cookie, id } = await signIn();
    await request(app.getHttpServer()).post('/auth/logout').set('Cookie', cookie).expect(204);
    await request(app.getHttpServer()).get('/me').set('Cookie', cookie).expect(401);
    const { rows } = await owner.query(
      `SELECT 1 FROM audit_log WHERE action = 'logout' AND actor_id = $1`,
      [id],
    );
    expect(rows).toHaveLength(1);
  });

  it('ends access as soon as the person is deactivated', async () => {
    const { cookie, id } = await signIn();
    await owner.query(`UPDATE employees SET status = 'deactivated' WHERE id = $1`, [id]);
    await request(app.getHttpServer()).get('/me').set('Cookie', cookie).expect(401);
  });

  it('ignores expired sessions', async () => {
    const { cookie, id } = await signIn();
    await owner.query(
      `UPDATE sessions SET expires_at = now() - interval '1 second' WHERE employee_id = $1`,
      [id],
    );
    await request(app.getHttpServer()).get('/me').set('Cookie', cookie).expect(401);
  });

  it('stores only a hash of the session token', async () => {
    const { cookie, id } = await signIn();
    const token = cookie.split('=')[1]!;
    const { rows } = await owner.query<{ token_hash: Buffer }>(
      `SELECT token_hash FROM sessions WHERE employee_id = $1`,
      [id],
    );
    expect(rows[0]!.token_hash.toString('base64url')).not.toBe(token);
    expect(rows[0]!.token_hash).toHaveLength(32);
  });

  it('refuses writes from a foreign origin', async () => {
    const { cookie } = await signIn();
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .expect(403);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', WEB_ORIGIN)
      .expect(204);
  });
});

describe('dev login', () => {
  it('works when enabled', async () => {
    const person = await insertEmployee(owner);
    await request(app.getHttpServer())
      .post('/auth/dev-login')
      .send({ email: person.email })
      .expect(204);
  });

  it('does not exist when disabled', async () => {
    const disabled = await createTestApp(testEnv({ DEV_LOGIN_ENABLED: 'false' }));
    try {
      const person = await insertEmployee(owner);
      await request(disabled.getHttpServer())
        .post('/auth/dev-login')
        .send({ email: person.email })
        .expect(404);
    } finally {
      await disabled.close();
    }
  });
});
