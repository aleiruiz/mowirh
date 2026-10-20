-- Data principles (spec: "Data principles"): nothing is hard-deleted and the
-- audit log is append-only. Enforced in the database, not only in app code.

-- The restricted role the API connects as. Login and password are set by ops
-- (see docs/runbook.md); this migration only owns its privileges.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mowihr_app') THEN
    CREATE ROLE mowihr_app NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION mowihr_forbid_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Hard delete on % is not allowed; use a soft delete', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION mowihr_forbid_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE on % is not allowed', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION mowihr_audit_log_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only'
    USING ERRCODE = 'insufficient_privilege';
END
$$;--> statement-breakpoint

-- Every table gets the delete/truncate guards. New tables must add them too;
-- test/db-protections.spec.ts fails if one is missing.
CREATE TRIGGER areas_forbid_delete BEFORE DELETE ON areas FOR EACH ROW EXECUTE FUNCTION mowihr_forbid_delete();--> statement-breakpoint
CREATE TRIGGER employees_forbid_delete BEFORE DELETE ON employees FOR EACH ROW EXECUTE FUNCTION mowihr_forbid_delete();--> statement-breakpoint
CREATE TRIGGER role_assignments_forbid_delete BEFORE DELETE ON role_assignments FOR EACH ROW EXECUTE FUNCTION mowihr_forbid_delete();--> statement-breakpoint
CREATE TRIGGER sessions_forbid_delete BEFORE DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION mowihr_forbid_delete();--> statement-breakpoint
CREATE TRIGGER audit_log_forbid_delete BEFORE DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION mowihr_forbid_delete();--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE ON audit_log FOR EACH ROW EXECUTE FUNCTION mowihr_audit_log_append_only();--> statement-breakpoint
CREATE TRIGGER areas_forbid_truncate BEFORE TRUNCATE ON areas FOR EACH STATEMENT EXECUTE FUNCTION mowihr_forbid_truncate();--> statement-breakpoint
CREATE TRIGGER employees_forbid_truncate BEFORE TRUNCATE ON employees FOR EACH STATEMENT EXECUTE FUNCTION mowihr_forbid_truncate();--> statement-breakpoint
CREATE TRIGGER role_assignments_forbid_truncate BEFORE TRUNCATE ON role_assignments FOR EACH STATEMENT EXECUTE FUNCTION mowihr_forbid_truncate();--> statement-breakpoint
CREATE TRIGGER sessions_forbid_truncate BEFORE TRUNCATE ON sessions FOR EACH STATEMENT EXECUTE FUNCTION mowihr_forbid_truncate();--> statement-breakpoint
CREATE TRIGGER audit_log_forbid_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION mowihr_forbid_truncate();--> statement-breakpoint

-- Privileges: the app role can read, insert and update, and nothing else.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM mowihr_app;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO mowihr_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON areas, employees, role_assignments, sessions TO mowihr_app;--> statement-breakpoint
GRANT SELECT, INSERT ON audit_log TO mowihr_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mowihr_app;--> statement-breakpoint
-- Tables created later get read and insert only; UPDATE is granted table by
-- table, so versioned and insert-only tables stay immutable by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO mowihr_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO mowihr_app;
