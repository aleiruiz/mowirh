import { Body, Controller, Get, Inject, NotFoundException, Patch } from '@nestjs/common';
import { LOCALES } from '@mowihr/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { CurrentActor } from '../auth/decorators.js';
import type { Actor } from '../common/request-context.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DB, type Database } from '../db/client.js';
import { employees } from '../db/schema.js';
import { live } from '../db/soft-delete.js';

const preferencesSchema = z.object({ locale: z.enum(LOCALES) }).strict();

const profileColumns = {
  id: employees.id,
  email: employees.email,
  fullName: employees.fullName,
  jobTitle: employees.jobTitle,
  areaId: employees.areaId,
  leaderId: employees.leaderId,
  country: employees.country,
  locale: employees.locale,
};

@Controller('me')
export class MeController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async me(@CurrentActor() actor: Actor) {
    const [employee] = await this.db
      .select(profileColumns)
      .from(employees)
      .where(live(employees, eq(employees.id, actor.employeeId)));
    if (!employee) throw new NotFoundException();
    return { ...employee, roles: actor.roles };
  }

  @Patch('preferences')
  async updatePreferences(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(preferencesSchema)) body: z.infer<typeof preferencesSchema>,
  ) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx
        .select({ locale: employees.locale })
        .from(employees)
        .where(live(employees, eq(employees.id, actor.employeeId)))
        .for('update');
      if (!before) throw new NotFoundException();

      const [after] = await tx
        .update(employees)
        .set({ locale: body.locale, updatedAt: new Date(), updatedBy: actor.employeeId })
        .where(eq(employees.id, actor.employeeId))
        .returning({ locale: employees.locale });

      await this.audit.record(
        { action: 'update', entityType: 'employee', entityId: actor.employeeId, before, after },
        tx,
      );
      return after;
    });
  }
}
