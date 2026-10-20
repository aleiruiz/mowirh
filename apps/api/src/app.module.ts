import {
  type MiddlewareConsumer,
  Module,
  type DynamicModule,
  type NestModule,
} from '@nestjs/common';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { RequestContextMiddleware } from './common/request-context.middleware.js';
import { ENV, type Env } from './config/env.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './health/health.controller.js';
import { MeController } from './me/me.controller.js';
import { RolesController } from './roles/roles.controller.js';

@Module({})
export class AppModule implements NestModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [DbModule, AuditModule, AuthModule],
      controllers: [HealthController, MeController, RolesController],
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
