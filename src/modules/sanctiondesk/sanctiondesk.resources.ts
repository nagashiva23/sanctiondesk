import { ResourceDecorator as Resource, Injectable, ExecutionContext } from '@nitrostack/core';
import { PolicyStoreService } from '../../policy/store.service.js';
import { LedgerStoreService } from '../../ledger/store.service.js';
import { shortHash } from '../../kernel/policy.js';
import { isOfficerContext } from '../../auth/officer.guard.js';
import { redactPayload } from '../../auth/redact-for-applicants.interceptor.js';
import { CaseAccessService } from '../../auth/case-access.service.js';

/**
 * Where MCP is load-bearing (see plan section 2.4): policy is fetched
 * during the reasoning loop as live addressable state, not loaded as
 * config at boot, and case ledgers are addressable by a templated URI the
 * client discovers rather than being told about.
 */
@Injectable({ deps: [PolicyStoreService, LedgerStoreService, CaseAccessService] })
export class SanctionDeskResources {
  constructor(
    private readonly policyStore: PolicyStoreService,
    private readonly ledgerStore: LedgerStoreService,
    private readonly caseAccess: CaseAccessService,
  ) {}

  @Resource({
    uri: 'policy://active',
    name: 'Active Policy',
    description: 'The currently active versioned rulebook (gates, product terms, FIOR bands, hard-reject rules). Read this before evaluating any application to know which policy version is in force. NOTE: once JWT_REQUIRED=true, resource reads cannot carry officer auth (NitroStack does not pass request metadata into resource handlers), so this always returns the redacted, no-rules view in enforced mode -- an officer should use list_policy_versions / update_policy (tools) for full rulebook detail instead.',
    mimeType: 'application/json',
  })
  async getActivePolicy(uri: string, ctx: ExecutionContext) {
    const doc = this.policyStore.getActive();
    ctx.logger.info('Active policy read', { versionLabel: doc.versionLabel, versionHash: shortHash(doc.versionHash) });
    const isOfficer = isOfficerContext(ctx);
    const body = isOfficer
      ? { ...doc, versionHashShort: shortHash(doc.versionHash), degraded: this.policyStore.isDegraded() }
      : {
          versionLabel: doc.versionLabel,
          versionHash: doc.versionHash,
          versionHashShort: shortHash(doc.versionHash),
          active: doc.active,
          degraded: this.policyStore.isDegraded(),
          note: 'Full rulebook detail (thresholds, rates, bands) requires officer authentication.',
        };
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(body, null, 2),
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
    const isOfficer = isOfficerContext(ctx);
    const body = isOfficer
      ? { found: true, ...doc }
      : { found: true, versionLabel: doc.versionLabel, versionHash: doc.versionHash, active: doc.active, createdAt: doc.createdAt, note: 'Full rulebook detail requires officer authentication.' };
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(body, null, 2) }] };
  }

  @Resource({
    uri: 'case://{caseId}/ledger',
    name: 'Case Ledger',
    description: 'The full append-only audit chain for a case, plus a live verification report (validity, breach index if tampered, and Merkle root if valid). Tools return links to this resource rather than embedding the whole chain in every response. NOTE: in an enforced deployment (JWT_REQUIRED=true), a resource read cannot carry a case-access token -- NitroStack does not pass request metadata into resource handlers -- so this will be denied once the case has any data, even for its rightful owner. Use the verify_audit_chain or generate_sanction_letter TOOLS (which do support the token) for authenticated per-case access once enforcement is on.',
    mimeType: 'application/json',
  })
  async getCaseLedger(uri: string, ctx: ExecutionContext) {
    const match = uri.match(/^case:\/\/([^/]+)\/ledger$/);
    const caseId = match?.[1] ?? '';
    const blocks = this.ledgerStore.getChain(caseId);
    // Resources can't use @UseGuards, and (unlike tools/call) resources/read
    // never receives _meta at all -- server.js calls createContext() with no
    // options for ReadResourceRequestSchema, so ctx.metadata is always empty
    // here. This means authorize() can never see a bearer token via this path
    // and will deny any already-touched case once enforcement is on -- fails
    // closed (never leaks), but also blocks the legitimate owner. That's a
    // real NitroStack limitation, not a bug in this check: no per-request
    // resource identity means no resource-level per-case access control.
    this.caseAccess.authorize(caseId, blocks.length > 0, ctx);
    const verification = this.ledgerStore.verify(caseId);
    ctx.logger.info('Case ledger read', { caseId, blockCount: blocks.length, valid: verification.valid });
    const isOfficer = isOfficerContext(ctx);
    // Block hashes/links/eventType/actor stay untouched either way -- that's the
    // integrity trail this resource exists to prove. Only each block's payload
    // (which for DECISION_EMITTED embeds the full gate table) is redacted.
    const outputBlocks = isOfficer ? blocks : blocks.map((b) => ({ ...b, payload: redactPayload(b.payload) }));
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ caseId, blockCount: blocks.length, verification, blocks: outputBlocks }, null, 2),
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
