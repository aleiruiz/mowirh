import { Inject, Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { ENV, type Env } from '../config/env.js';

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  /** Google Workspace domain of the account; absent for personal Gmail accounts. */
  hostedDomain: string | null;
  name: string | null;
}

export abstract class GoogleTokenVerifier {
  /** Verifies a Google ID token's signature, audience and expiry. Throws if invalid. */
  abstract verify(idToken: string): Promise<GoogleIdentity>;
}

@Injectable()
export class GoogleAuthLibraryVerifier extends GoogleTokenVerifier {
  private readonly client = new OAuth2Client();

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: this.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.sub) throw new Error('Google token has no email');
    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      hostedDomain: payload.hd ?? null,
      name: payload.name ?? null,
    };
  }
}
