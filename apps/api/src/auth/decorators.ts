import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@mowihr/shared';
import { currentRequestContext, type Actor } from '../common/request-context.js';

export const IS_PUBLIC = 'mowihr:isPublic';
export const REQUIRED_ROLES = 'mowihr:requiredRoles';

/** Opts an endpoint out of authentication. Everything else requires a session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Restricts an endpoint to people holding any of the given roles (in any area).
 * super_admin always passes. Area-specific checks belong in the service.
 */
export const RequireRoles = (...roles: Role[]) => SetMetadata(REQUIRED_ROLES, roles);

/** The signed-in person. Only use on endpoints that are not @Public. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext): Actor => {
    const actor = currentRequestContext()?.actor;
    if (!actor) throw new Error('CurrentActor used on an endpoint without an authenticated actor');
    return actor;
  },
);
