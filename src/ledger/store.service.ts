import { Injectable } from '@nitrostack/core';
import type { LedgerBlock, LedgerBlockInput, VerifyReport } from './chain.js';
import { InMemoryLedgerRepository, type LedgerRepository } from './repository.js';

/**
 * Ledger store. Storage lives behind LedgerRepository (in-memory today,
 * MongoDB later) -- callers (the tools) never talk to AuditChain or a
 * database directly, only to this service.
 *
 * NOTE: the in-memory repository resets on process restart. That's the
 * documented tradeoff of "policy store and ledger as memory for now" -- a
 * real deployment needs durable storage precisely because ledger_blocks
 * must survive a restart.
 */
@Injectable()
export class LedgerStoreService {
  /**
   * Deliberately a field initializer, not a constructor parameter -- see
   * the matching comment in policy/store.service.ts. An interface-typed
   * constructor parameter erases to `Object` in the DI container's
   * fallback `design:paramtypes` lookup, which would inject an empty
   * object instead of respecting a default value.
   */
  private readonly repo: LedgerRepository = new InMemoryLedgerRepository();

  caseExists(caseId: string): boolean {
    return this.repo.has(caseId);
  }

  append(input: LedgerBlockInput): LedgerBlock {
    return this.repo.getOrCreate(input.caseId).append(input);
  }

  getChain(caseId: string): LedgerBlock[] {
    return this.repo.get(caseId)?.getBlocks() ?? [];
  }

  verify(caseId: string): VerifyReport {
    if (!this.repo.has(caseId)) {
      return { valid: false, breachIndex: null, reason: null, blockCount: 0, merkleRoot: null };
    }
    return this.repo.getOrCreate(caseId).verify();
  }

  listCases(): string[] {
    return this.repo.listCaseIds();
  }

  /**
   * FOR DEMO USE ONLY. Directly mutates a stored block's payload to
   * demonstrate that verify() catches tampering, with the breach index it
   * reports. A production ledger store has no such method -- append-only
   * means append-only.
   */
  debugTamperBlock(caseId: string, index: number, mutatedPayload: unknown): boolean {
    const chain = this.repo.get(caseId);
    if (!chain) return false;
    const blocks = chain.getBlocks();
    const block = blocks[index];
    if (!block) return false;
    (block as { payload: unknown }).payload = mutatedPayload;
    return true;
  }
}
