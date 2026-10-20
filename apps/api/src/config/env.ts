import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    /** Connection string for the restricted app role (mowihr_app). */
    DATABASE_URL: z.url(),
    /** OAuth client id of the Google Workspace sign-in client. */
    GOOGLE_CLIENT_ID: z.string().min(1),
    /** Only accounts from this Google Workspace domain can sign in, e.g. mowiapp.com. */
    GOOGLE_WORKSPACE_DOMAIN: z.string().min(1),
    /** Origin of the web app, used for CORS and cookie checks. */
    WEB_ORIGIN: z.url(),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
    /** Only for local development and automated tests; refused in staging and production. */
    DEV_LOGIN_ENABLED: booleanString,
    /** Number of reverse proxies in front of the API (load balancer = 1). */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  })
  .superRefine((env, ctx) => {
    if (env.DEV_LOGIN_ENABLED && (env.NODE_ENV === 'staging' || env.NODE_ENV === 'production')) {
      ctx.addIssue({
        code: 'custom',
        path: ['DEV_LOGIN_ENABLED'],
        message: 'Dev login cannot be enabled in staging or production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
