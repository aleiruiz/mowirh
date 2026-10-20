import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AREA_SCOPED_ROLES } from '@mowihr/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { CurrentActor, RequireRoles } from '../auth/decorators.js';
import type { Actor } from '../common/request-context.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DB, type Database } from '../db/client.js';
import { areas, employees, roleAssignments } from '../db/schema.js';
import { live, softDelete } from '../db/soft-delete.js';

/** super_admin is only ever the CEO and is set by the seed script, never through the API. */
const GRANTABLE_ROLES = ['area_leader', 'hr', 'board_approver'] as const;

const createSchema = z
  .object({
    employeeId: z.uuid(),
    role: z.enum(GRANTABLE_ROLES),
    areaId: z.uuid().nullable().default(null),
  })
  .strict()
  .refine((v) => AREA_SCOPED_ROLES.includes(v.role) === (v.areaId !== null), {
    message: 'area_leader and board_approver need an areaId; hr must not have one',
    path: ['areaId'],
  });

const listSchema = z.object({ employeeId: z.uuid() });

@Controller('role-assignments')
export class RolesController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireRoles('hr')
  async list(@Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>) {
    return this.db
      .select({
        id: roleAssignments.id,
        employeeId: roleAssignments.employeeId,
        role: roleAssignments.role,
        areaId: roleAssignments.areaId,
        createdAt: roleAssignments.createdAt,
      })
      .from(roleAssignments)
      .where(live(roleAssignments, eq(roleAssignments.employeeId, query.employeeId)));
  }

  @Post()
  @RequireRoles('super_admin')
  async create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    if (body.employeeId === actor.employeeId) {
      throw new BadRequestException('You cannot change your own roles');
    }
    return this.db.transaction(async (tx) => {
      const [employee] = await tx
        .select({ id: employees.id, status: employees.status })
        .from(employees)
        .where(live(employees, eq(employees.id, body.employeeId)));
      if (!employee || employee.status !== 'active')
        throw new NotFoundException('Employee not found');

      if (body.areaId) {
        const [area] = await tx
          .select({ id: areas.id })
          .from(areas)
          .where(live(areas, eq(areas.id, body.areaId), eq(areas.status, 'active')));
        if (!area) throw new NotFoundException('Area not found');
      }

      const [created] = await tx
        .insert(roleAssignments)
        .values({ ...body, createdBy: actor.employeeId, updatedBy: actor.employeeId })
        .onConflictDoNothing()
        .returning();
      if (!created) throw new ConflictException('Role already assigned');

      await this.audit.record(
        { action: 'create', entityType: 'role_assignment', entityId: created.id, after: created },
        tx,
      );
      return created;
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireRoles('super_admin')
  async remove(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(roleAssignments)
        .where(live(roleAssignments, eq(roleAssignments.id, id)))
        .for('update');
      if (!current || current.role === 'super_admin') throw new NotFoundException();
      if (current.employeeId === actor.employeeId) {
        throw new BadRequestException('You cannot change your own roles');
      }

      const after = await softDelete(tx, roleAssignments, id, actor.employeeId);
      await this.audit.record(
        {
          action: 'soft_delete',
          entityType: 'role_assignment',
          entityId: id,
          before: current,
          after,
        },
        tx,
      );
    });
  }
}
