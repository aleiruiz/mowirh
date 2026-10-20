import { randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ENV, type Env } from '../config/env.js';
import { SESSION_COOKIE, SessionService } from '../auth/session.service.js';
import { runWithRequestContext } from './request-context.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Builds the per-request context (request id, client address, signed-in person)
 * that guards and the audit log read, and blocks cross-site writes.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly sessions: SessionService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const requestId = randomUUID();
    res.setHeader('x-request-id', requestId);

    // CSRF defence on top of SameSite=Lax: a browser always sends Origin on
    // cross-site writes, so any write carrying a foreign Origin is refused.
    if (!SAFE_METHODS.has(req.method)) {
      const origin = req.get('origin');
      if (origin && origin !== this.env.WEB_ORIGIN) {
        return next(new ForbiddenException('Origin not allowed'));
      }
    }

    const token: unknown = req.cookies?.[SESSION_COOKIE];
    const resolved = typeof token === 'string' && token ? await this.sessions.resolve(token) : null;

    runWithRequestContext(
      {
        requestId,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
        actor: resolved?.actor ?? null,
        sessionId: resolved?.sessionId ?? null,
      },
      () => next(),
    );
  }
}
