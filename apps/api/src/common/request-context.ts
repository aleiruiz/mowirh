import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '@mowihr/shared';

export interface Actor {
  employeeId: string;
  email: string;
  roles: ActorRole[];
}

export interface ActorRole {
  role: Role;
  /** Set for area-scoped roles (area_leader, board_approver). */
  areaId: string | null;
}

export interface RequestContext {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  actor: Actor | null;
  sessionId: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** The context of the current HTTP request, or undefined outside one (scripts, jobs). */
export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
