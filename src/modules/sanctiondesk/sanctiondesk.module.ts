import { Module } from '@nitrostack/core';
import { PolicyStoreService } from '../../policy/store.service.js';
import { LedgerStoreService } from '../../ledger/store.service.js';
import { PopulationService } from '../../population/population.service.js';
import { CaseAccessService } from '../../auth/case-access.service.js';
import { SanctionDeskTools } from './sanctiondesk.tools.js';
import { SanctionDeskResources } from './sanctiondesk.resources.js';
import { SanctionDeskPrompts } from './sanctiondesk.prompts.js';

@Module({
  name: 'sanctiondesk',
  description: 'Agentic loan approval: deterministic policy kernel, versioned policy store, hash-chained audit ledger, and the tools/resources/prompts an MCP client uses to underwrite an application.',
  providers: [PolicyStoreService, LedgerStoreService, PopulationService, CaseAccessService],
  controllers: [SanctionDeskTools, SanctionDeskResources, SanctionDeskPrompts],
})
export class SanctionDeskModule {}
