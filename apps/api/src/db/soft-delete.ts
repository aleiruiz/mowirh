import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { DbExecutor } from './client.js';

interface SoftDeletable extends PgTable {
  id: PgColumn;
  deletedAt: PgColumn;
  deletedBy: PgColumn;
  updatedAt: PgColumn;
  updatedBy: PgColumn;
}

/** Default filter for live rows. Every read of a business table should include it. */
export function notDeleted(table: { deletedAt: PgColumn }): SQL {
  return isNull(table.deletedAt);
}

/** Combines the live-row filter with other conditions. */
export function live(table: { deletedAt: PgColumn }, ...conditions: (SQL | undefined)[]): SQL {
  return and(notDeleted(table), ...conditions) as SQL;
}

/**
 * Logical delete: marks the row and returns it, or undefined if it was already
 * gone. Callers record the audit entry in the same transaction.
 */
export async function softDelete<T extends SoftDeletable>(
  db: DbExecutor,
  table: T,
  id: string,
  actorId: string | null,
) {
  const now = new Date();
  const rows = await db
    .update(table as SoftDeletable)
    .set({ deletedAt: now, deletedBy: actorId, updatedAt: now, updatedBy: actorId } as never)
    .where(and(eq(table.id, id), isNull(table.deletedAt)))
    .returning();
  return rows[0] as T['$inferSelect'] | undefined;
}
