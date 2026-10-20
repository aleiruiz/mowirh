import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Seeds the first super admin (the CEO) so someone can sign in and grant roles.
 * With --demo (refused in production) it also adds fake staff for staging.
 * Runs as the owner role; every row it writes is recorded in the audit log.
 */
export async function seed(
  ownerUrl: string,
  opts: { superAdminEmail: string; superAdminName: string; demo: boolean },
) {
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    const adminId = await upsertEmployee(client, {
      email: opts.superAdminEmail,
      fullName: opts.superAdminName,
      country: 'UY',
    });
    await ensureRole(client, adminId, 'super_admin', null);

    if (opts.demo) {
      const domain = opts.superAdminEmail.split('@')[1]!;
      const areaId = await ensureArea(client, 'Operaciones (demo)');
      const hrId = await upsertEmployee(client, {
        email: `rrhh.demo@${domain}`,
        fullName: 'RR. HH. Demo',
        country: 'UY',
      });
      await ensureRole(client, hrId, 'hr', null);
      const leaderId = await upsertEmployee(client, {
        email: `lider.demo@${domain}`,
        fullName: 'Líder Demo',
        country: 'AR',
        areaId,
      });
      await ensureRole(client, leaderId, 'area_leader', areaId);
      const boardId = await upsertEmployee(client, {
        email: `directorio.demo@${domain}`,
        fullName: 'Directorio Demo',
        country: 'UY',
      });
      await ensureRole(client, boardId, 'board_approver', areaId);
      await upsertEmployee(client, {
        email: `colaborador.demo@${domain}`,
        fullName: 'Colaboradora Demo',
        country: 'BR',
        areaId,
        leaderId,
      });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

async function audit(client: pg.Client, entityType: string, entityId: string, after: unknown) {
  await client.query(
    `INSERT INTO audit_log (action, entity_type, entity_id, after, metadata)
     VALUES ('create', $1, $2, $3, '{"source":"seed"}')`,
    [entityType, entityId, JSON.stringify(after)],
  );
}

async function upsertEmployee(
  client: pg.Client,
  e: { email: string; fullName: string; country: string; areaId?: string; leaderId?: string },
): Promise<string> {
  const email = e.email.toLowerCase();
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM employees WHERE email = $1 AND deleted_at IS NULL`,
    [email],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const { rows } = await client.query(
    `INSERT INTO employees (email, full_name, country, area_id, leader_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [email, e.fullName, e.country, e.areaId ?? null, e.leaderId ?? null],
  );
  await audit(client, 'employee', rows[0].id, rows[0]);
  return rows[0].id as string;
}

async function ensureArea(client: pg.Client, name: string): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM areas WHERE lower(name) = lower($1) AND deleted_at IS NULL`,
    [name],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const { rows } = await client.query(
    `INSERT INTO areas (name, status) VALUES ($1, 'active') RETURNING *`,
    [name],
  );
  await audit(client, 'area', rows[0].id, rows[0]);
  return rows[0].id as string;
}

async function ensureRole(
  client: pg.Client,
  employeeId: string,
  role: string,
  areaId: string | null,
) {
  const { rows } = await client.query(
    `INSERT INTO role_assignments (employee_id, role, area_id) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING RETURNING *`,
    [employeeId, role, areaId],
  );
  if (rows[0]) await audit(client, 'role_assignment', rows[0].id, rows[0]);
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  const ownerUrl = process.env.DATABASE_OWNER_URL;
  const email = process.env.SEED_SUPERADMIN_EMAIL;
  if (!ownerUrl || !email)
    throw new Error('DATABASE_OWNER_URL and SEED_SUPERADMIN_EMAIL are required');
  const demo = process.argv.includes('--demo');
  if (demo && process.env.NODE_ENV === 'production')
    throw new Error('Demo data is not allowed in production');
  await seed(ownerUrl, {
    superAdminEmail: email,
    superAdminName: process.env.SEED_SUPERADMIN_NAME ?? 'CEO',
    demo,
  });
  console.log(demo ? 'Seeded super admin and demo staff' : 'Seeded super admin');
}
