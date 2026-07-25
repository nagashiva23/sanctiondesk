import { Injectable } from '@nitrostack/core';
import { AuditChain, type LedgerBlock, type LedgerBlockInput, type VerifyReport } from './chain.js';

/**
 * In-memory ledger store, one process-wide singleton. The interface below
 * (append / getChain / verify / listCases / tamperBlock) is the boundary
 * that gets swapped for a MongoDB-backed implementation later -- callers
 * (the tools) never talk to AuditChain or a database directly.
 *
 * NOTE: this resets on process restart. That's the documented tradeoff of
 * "policy store and ledger as memory for now" -- a real deployment needs
 * durable storage precisely because ledger_blocks must survive a restart.
 */
@Injectable()
export class LedgerStoreService {
  private chains = new Map<string, AuditChain>();

  private chainFor(caseId: string): AuditChain {
    let chain = this.chains.get(caseId);
    if (!chain) {
      chain = new AuditChain();
      this.chains.set(caseId, chain);
    }
    return chain;
  }

  caseExists(caseId: string): boolean {
    return this.chains.has(caseId);
  }

  append(input: LedgerBlockInput): LedgerBlock {
    return this.chainFor(input.caseId).append(input);
  }

  getChain(caseId: string): LedgerBlock[] {
    return this.chains.get(caseId)?.getBlocks() ?? [];
  }

  verify(caseId: string): VerifyReport {
    if (!this.chains.has(caseId)) {
      return { valid: false, breachIndex: null, reason: null, blockCount: 0, merkleRoot: null };
    }
    return this.chainFor(caseId).verify();
  }

  listCases(): string[] {
    return [...this.chains.keys()];
  }

  /**
   * FOR DEMO USE ONLY. Directly mutates a stored block's payload to
   * demonstrate that verify() catches tampering, with the breach index it
   * reports. A production ledger store has no such method -- append-only
   * means append-only.
   */
  debugTamperBlock(caseId: string, index: number, mutatedPayload: unknown): boolean {
    const chain = this.chains.get(caseId);
    if (!chain) return false;
    const blocks = chain.getBlocks();
    const block = blocks[index];
    if (!block) return false;
    (block as { payload: unknown }).payload = mutatedPayload;
    return true;
  }
}
