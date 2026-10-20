import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ENV, type Env } from '../config/env.js';
import { currentRequestContext } from '../common/request-context.js';
import { DB, type Database } from '../db/client.js';
import { employees } from '../db/schema.js';
import { live } from '../db/soft-delete.js';
import { GoogleTokenVerifier } from './google-verifier.js';
import { SessionService } from './session.service.js';

/** What the client sees for every refused sign-in, so it cannot probe who exists. */
const REFUSED = 'Sign-in not allowed';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly verifier: GoogleTokenVerifier,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async signInWithGoogle(idToken: string) {
    let identity;
    try {
      identity = await this.verifier.verify(idToken);
    } catch (err) {
      this.logger.warn(`Google token rejected: ${(err as Error).message}`);
      await this.refuse('invalid_token', null);
    }

    const domain = this.env.GOOGLE_WORKSPACE_DOMAIN.toLowerCase();
    const email = identity!.email.toLowerCase();
    if (!identity!.emailVerified) await this.refuse('email_not_verified', email);
    // Both checks: hd proves a Workspace account, the suffix guards against an alias domain.
    if (identity!.hostedDomain?.toLowerCase() !== domain || !email.endsWith(`@${domain}`)) {
      await this.refuse('wrong_domain', email);
    }

    return this.startSession(email);
  }

  /** Local development and automated tests only; the controller refuses it otherwise. */
  async devSignIn(email: string) {
    return this.startSession(email.toLowerCase());
  }

  async signOut(sessionId: string) {
    await this.db.transaction(async (tx) => {
      await this.sessions.revoke(sessionId, tx);
      await this.audit.record({ action: 'logout', entityType: 'session', entityId: sessionId }, tx);
    });
  }

  private async startSession(email: string) {
    const [employee] = await this.db
      .select({ id: employees.id, status: employees.status })
      .from(employees)
      .where(live(employees, eq(employees.email, email)))
      .limit(1);
    if (!employee) await this.refuse('unknown_employee', email);
    if (employee!.status !== 'active') await this.refuse('deactivated', email, employee!.id);

    const ctx = currentRequestContext();
    return this.db.transaction(async (tx) => {
      const created = await this.sessions.create(
        employee!.id,
        { ip: ctx?.ip ?? null, userAgent: ctx?.userAgent ?? null },
        tx,
      );
      await this.audit.record(
        {
          action: 'login',
          entityType: 'session',
          entityId: created.session.id,
          actorId: employee!.id,
        },
        tx,
      );
      return created;
    });
  }

  private async refuse(reason: string, email: string | null, employeeId?: string): Promise<never> {
    await this.audit.record({
      action: 'login_failed',
      entityType: 'session',
      actorId: employeeId ?? null,
      metadata: { reason, email },
    });
    throw new UnauthorizedException(REFUSED);
  }
}
