import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, grantRole, insertArea, insertEmployee, ownerPool } from './helpers.js';

const owner = ownerPool();
let app: NestExpressApplication;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
  await owner.end();
});

async function signInAs(...roles: string[]): Promise<{ cookie: string; id: string }> {
  const person = await insertEmployee(owner);
  for (const role of roles) await grantRole(owner, person.id, role);
  const res = await request(app.getHttpServer())
    .post('/auth/dev-login')
    .send({ email: person.email });
  const raw = res.headers['set-cookie'] as unknown as string[];
  return { cookie: raw[0]!.split(';')[0]!, id: person.id };
}

describe('role checks', () => {
  it('keeps the audit log away from regular employees', async () => {
    const { cookie } = await signInAs();
    await request(app.getHttpServer()).get('/audit-log').set('Cookie', cookie).expect(403);
  });

  it.each(['hr', 'super_admin'])('lets %s read the audit log', async (role) => {
    const { cookie } = await signInAs(role);
    const res = await request(app.getHttpServer())
      .get('/audit-log?limit=5')
      .set('Cookie', cookie)
      .expect(200);
    expect(res.body.entries.length).toBeGreaterThan(0);
  });

  it('only counts area roles while the area is active', async () => {
    const pending = await insertArea(owner, `Pending ${Date.now()}`, 'pending_approval');
    const person = await insertEmployee(owner);
    await grantRole(owner, person.id, 'area_leader', pending);
    const res = await request(app.getHttpServer())
      .post('/auth/dev-login')
      .send({ email: person.email });
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;

    let me = await request(app.getHttpServer()).get('/me').set('Cookie', cookie).expect(200);
    expect(me.body.roles).toEqual([{ role: 'employee', areaId: null }]);

    await owner.query(`UPDATE areas SET status = 'active' WHERE id = $1`, [pending]);
    me = await request(app.getHttpServer()).get('/me').set('Cookie', cookie).expect(200);
    expect(me.body.roles).toContainEqual({ role: 'area_leader', areaId: pending });
  });
});

describe('role assignments', () => {
  it('lets the super admin grant and remove roles, with audit entries', async () => {
    const admin = await signInAs('super_admin');
    const target = await insertEmployee(owner);
    const area = await insertArea(owner, `Ops ${Date.now()}`);

    const created = await request(app.getHttpServer())
      .post('/role-assignments')
      .set('Cookie', admin.cookie)
      .send({ employeeId: target.id, role: 'area_leader', areaId: area })
      .expect(201);

    await request(app.getHttpServer())
      .post('/role-assignments')
      .set('Cookie', admin.cookie)
      .send({ employeeId: target.id, role: 'area_leader', areaId: area })
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/role-assignments/${created.body.id}`)
      .set('Cookie', admin.cookie)
      .expect(204);

    const { rows } = await owner.query(
      `SELECT action, actor_id FROM audit_log WHERE entity_type = 'role_assignment' AND entity_id = $1 ORDER BY id`,
      [created.body.id],
    );
    expect(rows).toEqual([
      { action: 'create', actor_id: admin.id },
      { action: 'soft_delete', actor_id: admin.id },
    ]);

    const { rows: stored } = await owner.query(
      `SELECT deleted_at, deleted_by FROM role_assignments WHERE id = $1`,
      [created.body.id],
    );
    expect(stored[0].deleted_at).not.toBeNull();
    expect(stored[0].deleted_by).toBe(admin.id);
  });

  it('can grant the role again after it was removed', async () => {
    const admin = await signInAs('super_admin');
    const target = await insertEmployee(owner);
    const first = await request(app.getHttpServer())
      .post('/role-assignments')
      .set('Cookie', admin.cookie)
      .send({ employeeId: target.id, role: 'hr' })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/role-assignments/${first.body.id}`)
      .set('Cookie', admin.cookie)
      .expect(204);
    await request(app.getHttpServer())
      .post('/role-assignments')
      .set('Cookie', admin.cookie)
      .send({ employeeId: target.id, role: 'hr' })
      .expect(201);
  });

  it('refuses granting super_admin through the API', async () => {
    const admin = await signInAs('super_admin');
    const target = await insertEmployee(owner);
    await request(app.getHttpServer())
      .post('/role-assignments')
      .set('Cookie', admin.cookie)
      .send({ employeeId: target.id, role: 'super_admin' })
      .expect(400);
  });

  it('refuses changing your own roles', async () => {
    const admin = await signInAs('super_admin');
    await request(app.getHttpServer())
      .post('/role-assignments')
      .set('Cookie', admin.cookie)
      .send({ employeeId: admin.id, role: 'hr' })
      .expect(400);
  });

  it('requires an area exactly for area-scoped roles', async () => {
    const admin = await signInAs('super_admin');
    const target = await insertEmployee(owner);
    await request(app.getHttpServer())
      .post('/role-assignments')
      .set('Cookie', admin.cookie)
      .send({ employeeId: target.id, role: 'board_approver' })
      .expect(400);
  });

  it('is not available to HR', async () => {
    const hr = await signInAs('hr');
    const target = await insertEmployee(owner);
    await request(app.getHttpServer())
      .post('/role-assignments')
      .set('Cookie', hr.cookie)
      .send({ employeeId: target.id, role: 'hr' })
      .expect(403);
  });
});

describe('preferences', () => {
  it('updates the locale and audits before and after', async () => {
    const me = await signInAs();
    await request(app.getHttpServer())
      .patch('/me/preferences')
      .set('Cookie', me.cookie)
      .send({ locale: 'pt' })
      .expect(200, { locale: 'pt' });
    await request(app.getHttpServer())
      .patch('/me/preferences')
      .set('Cookie', me.cookie)
      .send({ locale: 'fr' })
      .expect(400);

    const { rows } = await owner.query(
      `SELECT before, after, actor_id, request_id FROM audit_log WHERE entity_type = 'employee' AND entity_id = $1`,
      [me.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      before: { locale: 'es' },
      after: { locale: 'pt' },
      actor_id: me.id,
    });
    expect(rows[0].request_id).toBeTruthy();
  });
});
