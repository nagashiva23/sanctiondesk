import { McpApp, Module, ConfigModule, JWTModule } from '@nitrostack/core';
import { SanctionDeskModule } from './modules/sanctiondesk/sanctiondesk.module.js';
import { SystemHealthCheck } from './health/system.health.js';

/**
 * JWT gates the officer-only tools/resources (policy management, fairness
 * audit, tamper demo). Unless JWT_REQUIRED=true is set, every caller is
 * treated as an officer -- see src/auth/officer.guard.ts. In production,
 * set JWT_SECRET and JWT_REQUIRED=true, and issue tokens with
 * scripts/mint-officer-token.mjs.
 */
JWTModule.forRoot({
  secretEnvVar: 'JWT_SECRET',
  expiresIn: '24h',
});

/**
 * Root Application Module
 *
 * This is the main module that bootstraps the MCP server.
 * It registers all feature modules and health checks.
 */
@McpApp({
  module: AppModule,
  server: {
    name: 'sanctiondesk-server',
    version: '1.0.0'
  },
  logging: {
    level: 'info'
  }
})
@Module({
  name: 'app',
  description: 'Root application module',
  imports: [
    ConfigModule.forRoot(),
    SanctionDeskModule
  ],
  providers: [
    // Health Checks
    SystemHealthCheck,
  ]
})
export class AppModule {}

