import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import { AppModule } from '../src/app.module.js';
import { applyHttpSettings } from '../src/app.js';
import { GoogleTokenVerifier, type GoogleIdentity } from '../src/auth/google-verifier.js';
import { loadEnv, type Env } from '../src/config/env.js';

const ownerBase =
  process.env.TEST_DATABASE_OWNER_URL ??
  'postgres://mowihr_owner:mowihr_owner@localhost:5432/postgres';

export const TEST_DB_NAME = 'mowihr_test';
// mowihr_app is a cluster-wide role, so tests reuse the local password from .env.example.
export const TEST_APP_PASSWORD = 'mowihr_app';

export function ownerUrl(database = TEST_DB_NAME): string {
  const url = new URL(ownerBase);
  url.pathname = `/${database}`;
  return url.toString();
}

export function appUrl(): string {
  const url = new URL(ownerUrl());
  url.username = 'mowihr_app';
  url.password = TEST_APP_PASSWORD;
  return url.toString();
}

export const WEB_ORIGIN = 'http://localhost:3000';
export const DOMAIN = 'mowi.test';

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: appUrl(),
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_WORKSPACE_DOMAIN: DOMAIN,
    WEB_ORIGIN,
    DEV_LOGIN_ENABLED: 'true',
    ...overrides,
  });
}

/** Stands in for Google: a token is a JSON-encoded GoogleIdentity, or "bad" to fail. */
export class FakeGoogleVerifier extends GoogleTokenVerifier {
  async verify(idToken: string): Promise<GoogleIdentity> {
    if (idToken === 'bad') throw new Error('invalid signature');
    return JSON.parse(idToken) as GoogleIdentity;
  }
}

export function googleToken(email: string, overrides: Partial<GoogleIdentity> = {}): string {
  return JSON.stringify({
    sub: `sub-${email}`,
    email,
    emailVerified: true,
    hostedDomain: DOMAIN,
    name: email,
    ...overrides,
  } satisfies GoogleIdentity);
}

export async function createTestApp(env: Env = testEnv()): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
    .overrideProvider(GoogleTokenVerifier)
    .useClass(FakeGoogleVerifier)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  applyHttpSettings(app, env);
  await app.init();
  return app;
}

/** Owner connection for arranging data in tests (bypasses the app role's limits). */
export function ownerPool(): pg.Pool {
  return new pg.Pool({ connectionString: ownerUrl(), max: 2 });
}

/** Connection as the restricted app role, to check what the app itself may do. */
export function appPool(): pg.Pool {
  return new pg.Pool({ connectionString: appUrl(), max: 2 });
}

let counter = 0;
export function uniqueEmail(prefix = 'person'): string {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@${DOMAIN}`;
}

export async function insertEmployee(
  pool: pg.Pool,
  fields: {
    email?: string;
    fullName?: string;
    status?: 'active' | 'deactivated';
    country?: string;
  } = {},
): Promise<{ id: string; email: string }> {
  const email = fields.email ?? uniqueEmail();
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO employees (email, full_name, country, status) VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, fields.fullName ?? 'Test Person', fields.country ?? 'UY', fields.status ?? 'active'],
  );
  return { id: rows[0]!.id, email };
}

export async function grantRole(
  pool: pg.Pool,
  employeeId: string,
  role: string,
  areaId: string | null = null,
): Promise<void> {
  await pool.query(
    `INSERT INTO role_assignments (employee_id, role, area_id) VALUES ($1, $2, $3)`,
    [employeeId, role, areaId],
  );
}

export async function insertArea(pool: pg.Pool, name: string, status = 'active'): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO areas (name, status) VALUES ($1, $2) RETURNING id`,
    [name, status],
  );
  return rows[0]!.id;
}
