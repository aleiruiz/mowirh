import {
  Body,
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { LOCALE_COOKIE } from '@mowihr/shared';
import type { CookieOptions, Response } from 'express';
import { z } from 'zod';
import { ENV, isLocalEnv, type Env } from '../config/env.js';
import { currentRequestContext } from '../common/request-context.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { Public } from './decorators.js';
import { SignInRateLimitGuard } from './rate-limit.guard.js';
import { SESSION_COOKIE, SessionService } from './session.service.js';

const googleSchema = z.object({ credential: z.string().min(1).max(4096) });
const devSchema = z.object({ email: z.email() });

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @UseGuards(SignInRateLimitGuard)
  @Post('google')
  @HttpCode(204)
  async google(
    @Body(new ZodValidationPipe(googleSchema)) body: z.infer<typeof googleSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.setSessionCookies(res, await this.auth.signInWithGoogle(body.credential));
  }

  @Public()
  @UseGuards(SignInRateLimitGuard)
  @Post('dev-login')
  @HttpCode(204)
  async devLogin(@Body() rawBody: unknown, @Res({ passthrough: true }) res: Response) {
    // Checked before validation so the route is indistinguishable from a missing one.
    if (!this.env.DEV_LOGIN_ENABLED) throw new NotFoundException();
    const body = new ZodValidationPipe(devSchema).transform(rawBody);
    this.setSessionCookies(res, await this.auth.devSignIn(body.email));
  }

  // Public so a client holding an expired or revoked cookie can still clear it.
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Res({ passthrough: true }) res: Response) {
    const sessionId = currentRequestContext()?.sessionId;
    if (sessionId) await this.auth.signOut(sessionId);
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
    // Back to the default language, so the next person on a shared device isn't shown ours.
    res.clearCookie(LOCALE_COOKIE, { ...this.cookieOptions(), httpOnly: false });
  }

  private setSessionCookies(res: Response, session: { token: string; locale: string }) {
    res.cookie(SESSION_COOKIE, session.token, this.cookieOptions(this.sessions.ttlMs));
    // Readable by the web app, which renders in this language; not a secret.
    res.cookie(LOCALE_COOKIE, session.locale, {
      ...this.cookieOptions(365 * 24 * 60 * 60 * 1000),
      httpOnly: false,
    });
  }

  private cookieOptions(maxAge?: number): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: !isLocalEnv(this.env.NODE_ENV),
      path: '/',
      ...(maxAge ? { maxAge } : {}),
    };
  }
}
