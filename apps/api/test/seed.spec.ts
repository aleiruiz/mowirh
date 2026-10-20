import { afterAll, describe, expect, it } from 'vitest';
import { seed } from '../src/db/seed.js';
import { DOMAIN, ownerPool, ownerUrl } from './helpers.js';

const owner = ownerPool();
afterAll(() => owner.end());

describe('seed', () => {
  it('creates the super admin and demo staff once, with audit entries', async () => {
    const opts = { superAdminEmail: `CEO.seed@${DOMAIN}`, superAdminName: 'CEO', demo: true };
    await seed(ownerUrl(), opts);
    await seed(ownerUrl(), opts);

    const { rows } = await owner.query(
      `SELECT e.email, r.role FROM employees e JOIN role_assignments r ON r.employee_id = e.id
       WHERE e.email = $1`,
      [`ceo.seed@${DOMAIN}`],
    );
    expect(rows).toEqual([{ email: `ceo.seed@${DOMAIN}`, role: 'super_admin' }]);

    const { rows: audits } = await owner.query(
      `SELECT count(*)::int AS n FROM audit_log WHERE metadata->>'source' = 'seed' AND entity_type = 'role_assignment'`,
    );
    expect(audits[0].n).toBe(4);
  });
});
