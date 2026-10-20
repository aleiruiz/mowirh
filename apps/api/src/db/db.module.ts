import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type pg from 'pg';
import { ENV, type Env } from '../config/env.js';
import { createDatabase, createPool, DB, DB_POOL } from './client.js';

@Global()
@Module({
  providers: [
    {
      provide: DB_POOL,
      inject: [ENV],
      useFactory: (env: Env) => createPool(env.DATABASE_URL),
    },
    {
      provide: DB,
      inject: [DB_POOL],
      useFactory: (pool: pg.Pool) => createDatabase(pool),
    },
  ],
  exports: [DB, DB_POOL],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
