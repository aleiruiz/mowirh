import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigserial,
  check,
  customType,
  date,
  index,
  inet,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { LOCALES, ROLES } from '@mowihr/shared';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export const localeEnum = pgEnum('locale', LOCALES);
export const roleEnum = pgEnum('role', ROLES);
export const employeeStatusEnum = pgEnum('employee_status', ['active', 'deactivated']);
export const areaStatusEnum = pgEnum('area_status', ['pending_approval', 'active']);

/**
 * Columns every business table carries. Rows are never hard-deleted: a removal
 * sets deleted_at/deleted_by, and default queries filter on deleted_at IS NULL.
 */
const tracked = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: uuid('deleted_by'),
};

export const areas = pgTable(
  'areas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    status: areaStatusEnum('status').notNull().default('pending_approval'),
    ...tracked,
  },
  (t) => [
    uniqueIndex('areas_name_live_key')
      .on(sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Corporate Google Workspace address; the sign-in identity. Stored lower-case. */
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    jobTitle: text('job_title'),
    areaId: uuid('area_id').references(() => areas.id),
    leaderId: uuid('leader_id').references((): AnyPgColumn => employees.id),
    /** ISO 3166-1 alpha-2, e.g. UY, PY, AR, BR. Drives which holidays apply. */
    country: text('country').notNull(),
    startDate: date('start_date'),
    status: employeeStatusEnum('status').notNull().default('active'),
    locale: localeEnum('locale').notNull().default('es'),
    ...tracked,
  },
  (t) => [
    uniqueIndex('employees_email_live_key')
      .on(t.email)
      .where(sql`${t.deletedAt} IS NULL`),
    index('employees_area_idx').on(t.areaId),
    index('employees_leader_idx').on(t.leaderId),
    check('employees_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check('employees_country_code', sql`${t.country} ~ '^[A-Z]{2}$'`),
    check('employees_not_own_leader', sql`${t.leaderId} IS NULL OR ${t.leaderId} <> ${t.id}`),
  ],
);

/**
 * Roles beyond the implicit "employee" role every active person has.
 * area_leader and board_approver are scoped to one area; hr and super_admin are not.
 */
export const roleAssignments = pgTable(
  'role_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    role: roleEnum('role').notNull(),
    areaId: uuid('area_id').references(() => areas.id),
    ...tracked,
  },
  (t) => [
    uniqueIndex('role_assignments_live_key')
      .on(
        t.employeeId,
        t.role,
        sql`coalesce(${t.areaId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${t.deletedAt} IS NULL`),
    index('role_assignments_employee_idx').on(t.employeeId),
    check('role_assignments_not_employee', sql`${t.role} <> 'employee'`),
    check(
      'role_assignments_area_scope',
      sql`(${t.role} IN ('area_leader', 'board_approver')) = (${t.areaId} IS NOT NULL)`,
    ),
  ],
);

/**
 * Server-side sessions. The cookie holds a random token; only its SHA-256 is stored.
 * Sessions end by setting revoked_at, never by deleting the row.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    tokenHash: bytea('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ip: inet('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_employee_idx').on(t.employeeId),
  ],
);

export const AUDIT_ACTIONS = [
  'create',
  'update',
  'soft_delete',
  'restore',
  'approve',
  'reject',
  'login',
  'login_failed',
  'logout',
  'export',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export const auditActionEnum = pgEnum('audit_action', AUDIT_ACTIONS);

/** Append-only. The app role can only INSERT and SELECT; a trigger blocks UPDATE and DELETE. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid('actor_id').references(() => employees.id),
    action: auditActionEnum('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    /** Free-form extra detail, e.g. the reason a sign-in was refused. */
    metadata: jsonb('metadata'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
  },
  (t) => [
    index('audit_log_entity_idx').on(t.entityType, t.entityId),
    index('audit_log_actor_idx').on(t.actorId),
    index('audit_log_occurred_at_idx').on(t.occurredAt),
  ],
);
