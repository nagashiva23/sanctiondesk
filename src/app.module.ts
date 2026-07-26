import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { SanctionDeskModule } from './modules/sanctiondesk/sanctiondesk.module.js';
import { SystemHealthCheck } from './health/system.health.js';

/**
 * This server is unauthenticated by design: it only exposes client-facing
 * loan underwriting tools (assess_affordability, run_policy_gates,
 * price_risk_loan, sanction_decision, find_max_eligible, simulate_scenario,
 * generate_sanction_letter). Policy management, fairness auditing, human
 * override, and audit-chain sealing are manager operations that live
 * entirely in the separate Next.js manager console (src/demo-login), never
 * as MCP tools -- so there is no JWT/OAuth layer to configure here.
 */

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

