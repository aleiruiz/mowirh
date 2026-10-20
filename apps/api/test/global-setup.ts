import { randomBytes } from 'node:crypto';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../src/db/migrate.js';
import { ownerUrl, TEST_DB_NAME } from './helpers.js';

declare module 'vitest' {
  export interface ProvidedContext {
    appPassword: string;
  }
}

/**
 * Recreates the test database from the migrations before the suite runs, and
 * gives mowihr_app a fresh random password that the tests receive via inject().
 */
export default async function setup(project: TestProject) {
  const admin = new pg.Client({ connectionString: ownerUrl('postgres') });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await admin.end();
  }
  const appPassword = randomBytes(18).toString('base64url');
  await runMigrations(ownerUrl(), { enableAppLogin: true, appPassword });
  project.provide('appPassword', appPassword);
}
