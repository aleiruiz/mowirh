import pg from 'pg';
import { runMigrations } from '../src/db/migrate.js';
import { ownerUrl, TEST_APP_PASSWORD, TEST_DB_NAME } from './helpers.js';

/** Recreates the test database from the migrations before the suite runs. */
export default async function setup() {
  const admin = new pg.Client({ connectionString: ownerUrl('postgres') });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await admin.end();
  }
  await runMigrations(ownerUrl(), { appPassword: TEST_APP_PASSWORD });
}
