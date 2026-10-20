import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@mowihr/shared';
import { currentRequestContext } from '../common/request-context.js';
import { IS_PUBLIC, REQUIRED_ROLES } from './decorators.js';

/**
 * Global guard: every endpoint needs a valid session unless marked @Public, and
 * @RequireRoles endpoints also need one of the listed roles.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const actor = currentRequestContext()?.actor;
    if (!actor) throw new UnauthorizedException();

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(REQUIRED_ROLES, targets);
    if (!required || required.length === 0) return true;

    const held = new Set(actor.roles.map((r) => r.role));
    if (held.has('super_admin') || required.some((r) => held.has(r))) return true;
    throw new ForbiddenException();
  }
}
