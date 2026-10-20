import { Inject, Injectable } from '@nestjs/common';
import { DB, type Database, type DbExecutor } from '../db/client.js';
import { auditLog, type AuditAction } from '../db/schema.js';
import { currentRequestContext } from '../common/request-context.js';

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  /** Overrides the actor from the request context (e.g. the person who just signed in). */
  actorId?: string | null;
}

/**
 * Writes the append-only audit log. Pass the transaction that makes the change
 * so the change and its audit entry commit or roll back together.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async record(entry: AuditEntry, executor: DbExecutor = this.db): Promise<void> {
    const ctx = currentRequestContext();
    await executor.insert(auditLog).values({
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: toJson(entry.before),
      after: toJson(entry.after),
      metadata: entry.metadata ?? null,
      actorId: entry.actorId !== undefined ? entry.actorId : (ctx?.actor?.employeeId ?? null),
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      requestId: ctx?.requestId ?? null,
    });
  }
}

/** Dates and Buffers become JSON-safe; secrets never belong in an entry. */
function toJson(value: unknown): unknown {
  if (value === undefined) return null;
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) =>
      Buffer.isBuffer(v) ||
      (v && typeof v === 'object' && (v as { type?: string }).type === 'Buffer')
        ? '[binary]'
        : v,
    ),
  );
}
