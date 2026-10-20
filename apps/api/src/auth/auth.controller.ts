import { Body, Controller, HttpCode, Inject, NotFoundException, Post, Res } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { z } from 'zod';
import { ENV, type Env } from '../config/env.js';
import { currentRequestContext } from '../common/request-context.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { Public } from './decorators.js';
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
  @Post('google')
  @HttpCode(204)
  async google(
    @Body(new ZodValidationPipe(googleSchema)) body: z.infer<typeof googleSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = await this.auth.signInWithGoogle(body.credential);
    res.cookie(SESSION_COOKIE, token, this.cookieOptions(this.sessions.ttlMs));
  }

  @Public()
  @Post('dev-login')
  @HttpCode(204)
  async devLogin(
    @Body(new ZodValidationPipe(devSchema)) body: z.infer<typeof devSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!this.env.DEV_LOGIN_ENABLED) throw new NotFoundException();
    const { token } = await this.auth.devSignIn(body.email);
    res.cookie(SESSION_COOKIE, token, this.cookieOptions(this.sessions.ttlMs));
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Res({ passthrough: true }) res: Response) {
    const sessionId = currentRequestContext()?.sessionId;
    if (sessionId) await this.auth.signOut(sessionId);
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  private cookieOptions(maxAge?: number): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.env.NODE_ENV === 'staging' || this.env.NODE_ENV === 'production',
      path: '/',
      ...(maxAge ? { maxAge } : {}),
    };
  }
}
