import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;
/** A database handle or an open transaction; services accept either. */
export type DbExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10 });
}

export function createDatabase(pool: pg.Pool): Database {
  return drizzle(pool, { schema });
}

export const DB = Symbol('DB');
export const DB_POOL = Symbol('DB_POOL');
