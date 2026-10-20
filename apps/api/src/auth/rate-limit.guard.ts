import { type CanActivate, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { currentRequestContext } from '../common/request-context.js';
import { ENV, type Env } from '../config/env.js';

const WINDOW_MS = 5 * 60 * 1000;

/**
 * Caps sign-in attempts per client address. In-memory, so the limit is per API
 * instance; that is enough for a single-instance internal app. Move it to a
 * shared store if the API is scaled out.
 */
@Injectable()
export class SignInRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(): boolean {
    const key = currentRequestContext()?.ip ?? 'unknown';
    const now = Date.now();
    this.sweep(now);

    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }
    entry.count += 1;
    if (entry.count > this.env.SIGN_IN_ATTEMPTS_PER_5_MIN) {
      throw new HttpException('Too many sign-in attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private sweep(now: number) {
    if (this.hits.size < 10_000) return;
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}
