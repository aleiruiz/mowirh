import { afterAll, describe, expect, it } from 'vitest';
import { appPool, insertEmployee, ownerPool } from './helpers.js';

const owner = ownerPool();
const app = appPool();

afterAll(async () => {
  await owner.end();
  await app.end();
});

async function publicTables(): Promise<string[]> {
  const { rows } = await owner.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  return rows.map((r) => r.tablename);
}

describe('data protections', () => {
  it('guards every table against DELETE and TRUNCATE with triggers', async () => {
    const tables = await publicTables();
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      const { rows } = await owner.query<{ tgname: string }>(
        `SELECT t.tgname FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_proc p ON p.oid = t.tgfoid
         WHERE c.relname = $1 AND NOT t.tgisinternal
           AND p.proname IN ('mowihr_forbid_delete', 'mowihr_forbid_truncate')`,
        [table],
      );
      expect(rows.length, `${table} must have delete and truncate guard triggers`).toBe(2);
    }
  });

  it('gives the app role no DELETE or TRUNCATE privilege on any table', async () => {
    for (const table of await publicTables()) {
      const { rows } = await owner.query<{ del: boolean; trunc: boolean }>(
        `SELECT has_table_privilege('mowihr_app', $1, 'DELETE') AS del,
                has_table_privilege('mowihr_app', $1, 'TRUNCATE') AS trunc`,
        [`public.${table}`],
      );
      expect(rows[0], table).toEqual({ del: false, trunc: false });
    }
  });

  it('refuses a hard delete even from the owner role', async () => {
    const { id } = await insertEmployee(owner);
    await expect(owner.query(`DELETE FROM employees WHERE id = $1`, [id])).rejects.toThrow(
      /Hard delete on employees is not allowed/,
    );
  });

  it('refuses DELETE from the app role', async () => {
    await expect(app.query(`DELETE FROM employees`)).rejects.toThrow(/permission denied/);
  });

  it('refuses TRUNCATE from the app role', async () => {
    await expect(app.query(`TRUNCATE employees`)).rejects.toThrow(/permission denied/);
  });

  it('keeps the audit log append-only', async () => {
    await app.query(`INSERT INTO audit_log (action, entity_type) VALUES ('create', 'test')`);
    await expect(app.query(`UPDATE audit_log SET entity_type = 'x'`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(owner.query(`UPDATE audit_log SET entity_type = 'x'`)).rejects.toThrow(
      /append-only/,
    );
  });
});

describe('app role privileges', () => {
  // Tables the app may UPDATE. Anything else (audit log, future versioned
  // tables) must stay insert-only; add a table here only on purpose.
  const UPDATABLE = ['areas', 'employees', 'role_assignments', 'sessions'].sort();

  it('can update only the tables that are meant to change', async () => {
    const { rows } = await owner.query<{ tablename: string }>(
      `SELECT relname AS tablename FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
         AND has_table_privilege('mowihr_app', oid, 'UPDATE')
       ORDER BY relname`,
    );
    expect(rows.map((r) => r.tablename)).toEqual(UPDATABLE);
  });

  it('gives tables created later read and insert only', async () => {
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE TABLE privilege_probe (id int)');
      const { rows } = await client.query(
        `SELECT has_table_privilege('mowihr_app', 'privilege_probe', 'INSERT') AS ins,
                has_table_privilege('mowihr_app', 'privilege_probe', 'UPDATE') AS upd`,
      );
      expect(rows[0]).toEqual({ ins: true, upd: false });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
