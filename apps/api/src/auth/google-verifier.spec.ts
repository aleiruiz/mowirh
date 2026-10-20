import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../config/env.js';
import { GoogleAuthLibraryVerifier } from './google-verifier.js';

const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://u:p@localhost/db',
  GOOGLE_CLIENT_ID: 'client-123',
  GOOGLE_WORKSPACE_DOMAIN: 'mowi.test',
  WEB_ORIGIN: 'http://localhost:3000',
});

function verifierReturning(payload: Record<string, unknown> | undefined) {
  const verifier = new GoogleAuthLibraryVerifier(env);
  const spy = vi
    .spyOn(
      (verifier as unknown as { client: { verifyIdToken: () => Promise<unknown> } }).client,
      'verifyIdToken',
    )
    .mockResolvedValue({ getPayload: () => payload } as never);
  return { verifier, spy };
}

describe('GoogleAuthLibraryVerifier', () => {
  it('checks the audience and maps the claims', async () => {
    const { verifier, spy } = verifierReturning({
      sub: '1',
      email: 'a@mowi.test',
      email_verified: true,
      hd: 'mowi.test',
      name: 'A',
    });
    await expect(verifier.verify('tok')).resolves.toEqual({
      sub: '1',
      email: 'a@mowi.test',
      emailVerified: true,
      hostedDomain: 'mowi.test',
      name: 'A',
    });
    expect(spy).toHaveBeenCalledWith({ idToken: 'tok', audience: 'client-123' });
  });

  it('treats a missing email_verified or hd as not verified / no domain', async () => {
    const { verifier } = verifierReturning({ sub: '1', email: 'a@gmail.com' });
    await expect(verifier.verify('tok')).resolves.toMatchObject({
      emailVerified: false,
      hostedDomain: null,
    });
  });

  it('rejects tokens without an email', async () => {
    const { verifier } = verifierReturning({ sub: '1' });
    await expect(verifier.verify('tok')).rejects.toThrow(/no email/);
  });
});
