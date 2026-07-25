import { AuditChain } from './chain.js';

/**
 * Pure storage boundary: one hash chain per case. The chain's hashing,
 * linking, and verification logic (AuditChain, chain.ts) is domain logic
 * that stays the same regardless of what's behind this interface -- a
 * future MongoDB-backed implementation only has to persist/rehydrate
 * AuditChain instances per case.
 */
export interface LedgerRepository {
  has(caseId: string): boolean;
  get(caseId: string): AuditChain | undefined;
  getOrCreate(caseId: string): AuditChain;
  listCaseIds(): string[];
}

/** In-memory today; resets on process restart -- see LedgerStoreService for the documented tradeoff. */
export class InMemoryLedgerRepository implements LedgerRepository {
  private chains = new Map<string, AuditChain>();

  has(caseId: string): boolean {
    return this.chains.has(caseId);
  }

  get(caseId: string): AuditChain | undefined {
    return this.chains.get(caseId);
  }

  getOrCreate(caseId: string): AuditChain {
    let chain = this.chains.get(caseId);
    if (!chain) {
      chain = new AuditChain();
      this.chains.set(caseId, chain);
    }
    return chain;
  }

  listCaseIds(): string[] {
    return [...this.chains.keys()];
  }
}
