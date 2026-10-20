import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const base = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://u:p@localhost/db',
  GOOGLE_CLIENT_ID: 'id',
  GOOGLE_WORKSPACE_DOMAIN: 'mowi.test',
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    expect(loadEnv(base)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      DEV_LOGIN_ENABLED: false,
    });
  });

  it('requires NODE_ENV', () => {
    const { NODE_ENV: _omit, ...rest } = base;
    expect(() => loadEnv(rest)).toThrow(/NODE_ENV/);
  });

  it('normalises WEB_ORIGIN to a bare origin', () => {
    expect(loadEnv({ ...base, WEB_ORIGIN: 'https://hr.mowiapp.com/' }).WEB_ORIGIN).toBe(
      'https://hr.mowiapp.com',
    );
  });

  it.each(['staging', 'production'])('refuses dev login in %s', (NODE_ENV) => {
    expect(() => loadEnv({ ...base, NODE_ENV, DEV_LOGIN_ENABLED: 'true' })).toThrow(/Dev login/);
  });

  it('reports missing variables', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });
});
