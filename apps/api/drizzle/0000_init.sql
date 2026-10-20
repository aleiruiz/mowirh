CREATE TYPE "public"."area_status" AS ENUM('pending_approval', 'active');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'soft_delete', 'restore', 'approve', 'reject', 'login', 'login_failed', 'logout', 'export');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'deactivated');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('es', 'pt', 'en');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('employee', 'area_leader', 'hr', 'board_approver', 'super_admin');--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "area_status" DEFAULT 'pending_approval' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"action" "audit_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"ip" "inet",
	"user_agent" text,
	"request_id" text
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"job_title" text,
	"area_id" uuid,
	"leader_id" uuid,
	"country" text NOT NULL,
	"start_date" date,
	"status" "employee_status" DEFAULT 'active' NOT NULL,
	"locale" "locale" DEFAULT 'es' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "employees_email_lowercase" CHECK ("employees"."email" = lower("employees"."email")),
	CONSTRAINT "employees_country_code" CHECK ("employees"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "employees_not_own_leader" CHECK ("employees"."leader_id" IS NULL OR "employees"."leader_id" <> "employees"."id")
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"area_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "role_assignments_not_employee" CHECK ("role_assignments"."role" <> 'employee'),
	CONSTRAINT "role_assignments_area_scope" CHECK (("role_assignments"."role" IN ('area_leader', 'board_approver')) = ("role_assignments"."area_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" "inet",
	"user_agent" text
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_employees_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_leader_id_employees_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "areas_name_live_key" ON "areas" USING btree (lower("name")) WHERE "areas"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_log_occurred_at_idx" ON "audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_email_live_key" ON "employees" USING btree ("email") WHERE "employees"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "employees_area_idx" ON "employees" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "employees_leader_idx" ON "employees" USING btree ("leader_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignments_live_key" ON "role_assignments" USING btree ("employee_id","role",coalesce("area_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "role_assignments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "role_assignments_employee_idx" ON "role_assignments" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_employee_idx" ON "sessions" USING btree ("employee_id");