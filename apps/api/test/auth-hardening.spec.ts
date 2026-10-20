import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  googleToken,
  grantRole,
  insertEmployee,
  ownerPool,
  testEnv,
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

function cookies(res: request.Response): string[] {
  return (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
}

function sessionCookie(res: request.Response): string {
  return cookies(res)
    .find((c) => c.startsWith('mowihr_session='))!
    .split(';')[0]!;
}

async function auditCount(where: string, params: unknown[] = []): Promise<number> {
  const { rows } = await owner.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM audit_log WHERE ${where}`,
    params,
  );
  return rows[0]!.n;
}

describe('sign-in audit entries', () => {
  it('records client address, user agent and request id on login', async () => {
    const person = await insertEmployee(owner);
    await request(app.getHttpServer())
      .post('/auth/google')
      .set('User-Agent', 'vitest-agent')
      .send({ credential: googleToken(person.email) })
      .expect(204);
    const { rows } = await owner.query(
      `SELECT ip, user_agent, request_id FROM audit_log WHERE action = 'login' AND actor_id = $1`,
      [person.id],
    );
    expect(rows[0].ip).toBeTruthy();
    expect(rows[0].user_agent).toBe('vitest-agent');
    expect(rows[0].request_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps only the domain of outsiders who try to sign in', async () => {
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ credential: googleToken('someone.private@gmail.com', { hostedDomain: null }) })
      .expect(401);
    expect(await auditCount(`metadata::text LIKE '%someone.private%'`)).toBe(0);
    expect(await auditCount(`metadata->>'emailDomain' = 'gmail.com'`)).toBeGreaterThan(0);
  });

  it('does not write audit rows for tokens Google rejects', async () => {
    const before = await auditCount(`action = 'login_failed'`);
    await request(app.getHttpServer()).post('/auth/google').send({ credential: 'bad' }).expect(401);
    expect(await auditCount(`action = 'login_failed'`)).toBe(before);
  });
});

describe('cookies', () => {
  it('sets the saved language at sign-in and clears both cookies at sign-out', async () => {
    const person = await insertEmployee(owner);
    await owner.query(`UPDATE employees SET locale = 'en' WHERE id = $1`, [person.id]);
    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ credential: googleToken(person.email) })
      .expect(204);
    const locale = cookies(res).find((c) => c.startsWith('mowihr_locale='))!;
    expect(locale).toMatch(/^mowihr_locale=en;/);
    expect(locale).not.toMatch(/HttpOnly/);

    const out = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', sessionCookie(res))
      .expect(204);
    expect(cookies(out).some((c) => c.startsWith('mowihr_session=;'))).toBe(true);
    expect(cookies(out).some((c) => c.startsWith('mowihr_locale=;'))).toBe(true);
  });

  it('still clears the cookie when the session is already gone', async () => {
    const out = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', 'mowihr_session=expired-or-unknown')
      .expect(204);
    expect(cookies(out).some((c) => c.startsWith('mowihr_session=;'))).toBe(true);
  });

  it('marks cookies Secure outside development and test', async () => {
    const staging = await createTestApp(
      testEnv({ NODE_ENV: 'staging', DEV_LOGIN_ENABLED: 'false' }),
    );
    try {
      const person = await insertEmployee(owner);
      const res = await request(staging.getHttpServer())
        .post('/auth/google')
        .send({ credential: googleToken(person.email) })
        .expect(204);
      expect(cookies(res).every((c) => /;\s*Secure/i.test(c))).toBe(true);
    } finally {
      await staging.close();
    }
  });
});

describe('request checks', () => {
  it('allows writes without an Origin header (non-browser clients)', async () => {
    const person = await insertEmployee(owner);
    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ credential: googleToken(person.email) });
    await request(app.getHttpServer())
      .patch('/me/preferences')
      .set('Cookie', sessionCookie(res))
      .send({ locale: 'en' })
      .expect(200);
  });

  it('takes a removed role away from an open session', async () => {
    const person = await insertEmployee(owner);
    await grantRole(owner, person.id, 'hr');
    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ credential: googleToken(person.email) });
    const cookie = sessionCookie(res);
    await request(app.getHttpServer()).get('/audit-log').set('Cookie', cookie).expect(200);
    await owner.query(`UPDATE role_assignments SET deleted_at = now() WHERE employee_id = $1`, [
      person.id,
    ]);
    await request(app.getHttpServer()).get('/audit-log').set('Cookie', cookie).expect(403);
  });

  it('hides dev login entirely when disabled, even for a bad body', async () => {
    const disabled = await createTestApp(testEnv({ DEV_LOGIN_ENABLED: 'false' }));
    try {
      await request(disabled.getHttpServer()).post('/auth/dev-login').send({}).expect(404);
    } finally {
      await disabled.close();
    }
  });

  it('rate-limits sign-in attempts per client address', async () => {
    const limited = await createTestApp(testEnv({ SIGN_IN_ATTEMPTS_PER_5_MIN: '3' }));
    try {
      for (let i = 0; i < 3; i++) {
        await request(limited.getHttpServer())
          .post('/auth/google')
          .send({ credential: 'bad' })
          .expect(401);
      }
      await request(limited.getHttpServer())
        .post('/auth/google')
        .send({ credential: 'bad' })
        .expect(429);
    } finally {
      await limited.close();
    }
  });
});

describe('transactions', () => {
  it('rolls the change back when its audit entry cannot be written', async () => {
    const person = await insertEmployee(owner);
    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ credential: googleToken(person.email) });
    // Make the audit insert fail for this request only, then restore it.
    await owner.query(`REVOKE INSERT ON audit_log FROM mowihr_app`);
    try {
      await request(app.getHttpServer())
        .patch('/me/preferences')
        .set('Cookie', sessionCookie(res))
        .send({ locale: 'pt' })
        .expect(500);
    } finally {
      await owner.query(`GRANT INSERT ON audit_log TO mowihr_app`);
    }
    const { rows } = await owner.query(`SELECT locale FROM employees WHERE id = $1`, [person.id]);
    expect(rows[0].locale).toBe('es');
  });
});
