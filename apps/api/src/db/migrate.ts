import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { isLocalEnv } from '../config/env.js';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

/**
 * Applies migrations as the owner role. When appPassword is given, also lets the
 * restricted mowihr_app role log in with it (local and test databases only; in
 * staging and production ops sets the password, see docs/runbook.md).
 */
export async function runMigrations(ownerUrl: string, opts: { appPassword?: string } = {}) {
  const pool = new pg.Pool({ connectionString: ownerUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    if (opts.appPassword) {
      const client = await pool.connect();
      try {
        const quoted = client.escapeLiteral(opts.appPassword);
        await client.query(`ALTER ROLE mowihr_app LOGIN PASSWORD ${quoted}`);
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  const ownerUrl = process.env.DATABASE_OWNER_URL;
  if (!ownerUrl) throw new Error('DATABASE_OWNER_URL is required to run migrations');
  const appPassword = isLocalEnv(process.env.NODE_ENV)
    ? process.env.DATABASE_APP_PASSWORD
    : undefined;
  await runMigrations(ownerUrl, { appPassword });
  console.log('Migrations applied');
}
