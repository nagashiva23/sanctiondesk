import { McpApp, Module, ConfigModule, JWTModule } from '@nitrostack/core';
import { SanctionDeskModule } from './modules/sanctiondesk/sanctiondesk.module.js';
import { SystemHealthCheck } from './health/system.health.js';

/**
 * JWT gates the manager-only tools/resources (policy management, fairness
 * audit, tamper demo, human override) -- two-tier model, no further role
 * differentiation: see src/auth/token.ts (isManagerContext) and
 * src/auth/manager.guard.ts for enforcement. Unless JWT_REQUIRED=true is
 * set, every caller is auto-treated as a manager. In production, set
 * JWT_SECRET and JWT_REQUIRED=true, and issue tokens with
 * scripts/mint-token.mjs.
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

