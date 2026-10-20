/**
 * The five MowiHR roles (spec: "Roles and permissions"). A person can hold more
 * than one; area-scoped roles (area leader, board approver) carry an area id.
 */
export const ROLES = ['employee', 'area_leader', 'hr', 'board_approver', 'super_admin'] as const;

export type Role = (typeof ROLES)[number];

/** Roles that only make sense attached to a specific area. */
export const AREA_SCOPED_ROLES: readonly Role[] = ['area_leader', 'board_approver'];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
