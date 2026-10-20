import { Controller, Get, Inject, Query } from '@nestjs/common';
import { and, desc, eq, lt, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { RequireRoles } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DB, type Database } from '../db/client.js';
import { auditLog } from '../db/schema.js';

const querySchema = z.object({
  entityType: z.string().min(1).max(64).optional(),
  entityId: z.string().min(1).max(64).optional(),
  actorId: z.uuid().optional(),
  /** Cursor: return entries with an id lower than this. */
  beforeId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

@Controller('audit-log')
export class AuditController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get()
  @RequireRoles('hr')
  async list(@Query(new ZodValidationPipe(querySchema)) query: z.infer<typeof querySchema>) {
    const conditions: SQL[] = [];
    if (query.entityType) conditions.push(eq(auditLog.entityType, query.entityType));
    if (query.entityId) conditions.push(eq(auditLog.entityId, query.entityId));
    if (query.actorId) conditions.push(eq(auditLog.actorId, query.actorId));
    if (query.beforeId) conditions.push(lt(auditLog.id, query.beforeId));

    const entries = await this.db
      .select()
      .from(auditLog)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLog.id))
      .limit(query.limit);

    const last = entries.at(-1);
    return { entries, nextBeforeId: entries.length === query.limit && last ? last.id : null };
  }
}
