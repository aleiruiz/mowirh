import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { ENV, type Env } from '../config/env.js';
import type { Actor, ActorRole } from '../common/request-context.js';
import { DB, type Database, type DbExecutor } from '../db/client.js';
import { areas, employees, roleAssignments, sessions } from '../db/schema.js';
import { live, notDeleted } from '../db/soft-delete.js';

export const SESSION_COOKIE = 'mowihr_session';

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get ttlMs(): number {
    return this.env.SESSION_TTL_HOURS * 60 * 60 * 1000;
  }

  async create(
    employeeId: string,
    meta: { ip: string | null; userAgent: string | null },
    executor: DbExecutor = this.db,
  ) {
    const token = randomBytes(32).toString('base64url');
    const [session] = await executor
      .insert(sessions)
      .values({
        employeeId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + this.ttlMs),
        ip: meta.ip,
        userAgent: meta.userAgent,
      })
      .returning({ id: sessions.id, expiresAt: sessions.expiresAt });
    return { token, session: session! };
  }

  /**
   * Resolves a session token to the signed-in person. Returns null when the
   * session is unknown, expired or revoked, or the person is deactivated.
   */
  async resolve(token: string): Promise<{ sessionId: string; actor: Actor } | null> {
    const [row] = await this.db
      .select({ sessionId: sessions.id, employeeId: employees.id, email: employees.email })
      .from(sessions)
      .innerJoin(employees, eq(employees.id, sessions.employeeId))
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
          notDeleted(employees),
          eq(employees.status, 'active'),
        ),
      )
      .limit(1);
    if (!row) return null;

    return {
      sessionId: row.sessionId,
      actor: {
        employeeId: row.employeeId,
        email: row.email,
        roles: await this.rolesOf(row.employeeId),
      },
    };
  }

  async rolesOf(employeeId: string): Promise<ActorRole[]> {
    const rows = await this.db
      .select({ role: roleAssignments.role, areaId: roleAssignments.areaId })
      .from(roleAssignments)
      .leftJoin(areas, eq(areas.id, roleAssignments.areaId))
      .where(
        live(
          roleAssignments,
          eq(roleAssignments.employeeId, employeeId),
          // An area-scoped role only counts while its area is live and active.
          or(isNull(roleAssignments.areaId), and(notDeleted(areas), eq(areas.status, 'active'))),
        ),
      );
    return [{ role: 'employee', areaId: null }, ...rows];
  }

  async revoke(sessionId: string, executor: DbExecutor = this.db): Promise<void> {
    await executor
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
  }

  /** Ends every open session of a person, e.g. when they are deactivated. */
  async revokeAllFor(employeeId: string, executor: DbExecutor = this.db): Promise<void> {
    await executor
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.employeeId, employeeId), isNull(sessions.revokedAt)));
  }
}
