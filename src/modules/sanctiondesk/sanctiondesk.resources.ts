import { ResourceDecorator as Resource, Injectable, ExecutionContext } from '@nitrostack/core';
import { PolicyStoreService } from '../../policy/store.service.js';
import { LedgerStoreService } from '../../ledger/store.service.js';
import { shortHash } from '../../kernel/policy.js';

/**
 * Where MCP is load-bearing (see plan section 2.4): policy is fetched
 * during the reasoning loop as live addressable state, not loaded as
 * config at boot, and case ledgers are addressable by a templated URI the
 * client discovers rather than being told about.
 */
@Injectable({ deps: [PolicyStoreService, LedgerStoreService] })
export class SanctionDeskResources {
  constructor(
    private readonly policyStore: PolicyStoreService,
    private readonly ledgerStore: LedgerStoreService,
  ) {}

  @Resource({
    uri: 'policy://active',
    name: 'Active Policy',
    description: 'The currently active versioned rulebook (gates, product terms, FIOR bands, hard-reject rules). Read this before evaluating any application to know which policy version is in force.',
    mimeType: 'application/json',
  })
  async getActivePolicy(uri: string, ctx: ExecutionContext) {
    const doc = this.policyStore.getActive();
    ctx.logger.info('Active policy read', { versionLabel: doc.versionLabel, versionHash: shortHash(doc.versionHash) });
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ ...doc, versionHashShort: shortHash(doc.versionHash), degraded: this.policyStore.isDegraded() }, null, 2),
      }],
    };
  }

  @Resource({
    uri: 'policy://version/{hash}',
    name: 'Policy Version',
    description: 'A specific historical policy version by its full or short SHA-256 hash. Used to reproduce a past decision under the exact rulebook that produced it.',
    mimeType: 'application/json',
  })
  async getPolicyVersion(uri: string, ctx: ExecutionContext) {
    const match = uri.match(/^policy:\/\/version\/([^/]+)$/);
    const requestedHash = match?.[1] ?? '';
    const doc = this.policyStore.listVersions().find((v) => v.versionHash === requestedHash || v.versionHash.startsWith(requestedHash));
    ctx.logger.info('Policy version lookup', { requestedHash, found: !!doc });
    if (!doc) {
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ found: false, requestedHash }, null, 2) }] };
    }
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ found: true, ...doc }, null, 2) }] };
  }

  @Resource({
    uri: 'case://{caseId}/ledger',
    name: 'Case Ledger',
    description: 'The full append-only audit chain for a case, plus a live verification report (validity, breach index if tampered, and Merkle root if valid). Tools return links to this resource rather than embedding the whole chain in every response.',
    mimeType: 'application/json',
  })
  async getCaseLedger(uri: string, ctx: ExecutionContext) {
    const match = uri.match(/^case:\/\/([^/]+)\/ledger$/);
    const caseId = match?.[1] ?? '';
    const blocks = this.ledgerStore.getChain(caseId);
    const verification = this.ledgerStore.verify(caseId);
    ctx.logger.info('Case ledger read', { caseId, blockCount: blocks.length, valid: verification.valid });
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ caseId, blockCount: blocks.length, verification, blocks }, null, 2),
      }],
    };
  }

  @Resource({
    uri: 'regulation://rbi-free-ai',
    name: 'RBI FREE-AI Framework Excerpts',
    description: 'Relevant Sutras (2 and 7) from the RBI FREE-AI Committee framework (2025) that motivate this system\'s design: human override authority and non-delegable accountability. This is a committee framework, not binding regulation.',
    mimeType: 'application/json',
  })
  async getRbiFreeAi(uri: string, ctx: ExecutionContext) {
    ctx.logger.info('RBI FREE-AI resource read');
    const payload = {
      source: 'RBI FREE-AI Committee Framework (2025)',
      note: 'A committee framework, not binding regulation. Quoted for context, not as a compliance claim.',
      sutras: [
        {
          number: 2,
          title: 'Effective Oversight',
          text: 'Individuals retain the final authority to override AI determinations.',
          designImplication: 'MANUAL_REVIEW decisions in this system halt for a human officer; the officer\'s typed justification is written to the ledger as a HUMAN_OVERRIDE block.',
        },
        {
          number: 7,
          title: 'Responsibility',
          text: 'The deploying entity is accountable for AI decisions no matter how autonomous the system. There is no shifting blame to the model.',
          designImplication: 'The LLM orchestrator never authors an approve or reject. sanction_decision is a pure function of the deterministic kernel; every number traces to a policy version hash recorded in the ledger.',
        },
      ],
    };
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(payload, null, 2) }] };
  }
}
