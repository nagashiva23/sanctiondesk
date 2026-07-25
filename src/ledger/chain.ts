import { createHash } from 'crypto';
import { canonicalize } from '../kernel/policy.js';

/**
 * A permissioned, append-only hash chain with Merkle commitments -- the
 * integrity layer of a blockchain without the consensus layer. This is
 * NOT a claim of decentralisation: a single-writer audit log does not need
 * Byzantine fault tolerance. We claim tamper evidence and verifiable
 * inclusion only.
 */

export type LedgerEventType =
  | 'CASE_OPENED'
  | 'POLICY_READ'
  | 'TOOL_CALL'
  | 'DECISION_EMITTED'
  | 'COUNTERFACTUAL_GENERATED'
  | 'HUMAN_OVERRIDE'
  | 'CASE_SEALED';

export interface LedgerBlockInput {
  caseId: string;
  timestamp: string;
  eventType: LedgerEventType;
  actor: string;
  policyVersionHash: string;
  payload: unknown;
}

export interface LedgerBlock extends LedgerBlockInput {
  index: number;
  payloadHash: string;
  prevHash: string;
  hash: string;
}

export type VerifyReason = 'PAYLOAD_TAMPERED' | 'BLOCK_HASH_MISMATCH' | 'CHAIN_LINK_BROKEN' | null;

export interface VerifyReport {
  valid: boolean;
  breachIndex: number | null;
  reason: VerifyReason;
  blockCount: number;
  merkleRoot: string | null;
}

const GENESIS_HASH = '0'.repeat(64);

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(canonicalize(payload)).digest('hex');
}

function hashBlock(block: Omit<LedgerBlock, 'hash'>): string {
  const header = {
    index: block.index,
    caseId: block.caseId,
    timestamp: block.timestamp,
    eventType: block.eventType,
    actor: block.actor,
    policyVersionHash: block.policyVersionHash,
    payloadHash: block.payloadHash,
    prevHash: block.prevHash,
  };
  return createHash('sha256').update(canonicalize(header)).digest('hex');
}

export class AuditChain {
  private blocks: LedgerBlock[] = [];

  constructor(existingBlocks: LedgerBlock[] = []) {
    this.blocks = [...existingBlocks];
  }

  append(input: LedgerBlockInput): LedgerBlock {
    const index = this.blocks.length;
    const prevHash = index === 0 ? GENESIS_HASH : this.blocks[index - 1].hash;
    const payloadHash = hashPayload(input.payload);
    const withoutHash = { ...input, index, payloadHash, prevHash };
    const hash = hashBlock(withoutHash);
    const block: LedgerBlock = { ...withoutHash, hash };
    this.blocks.push(block);
    return block;
  }

  getBlocks(): LedgerBlock[] {
    return [...this.blocks];
  }

  /**
   * Returns a report, not a boolean: validity, breach index, and a reason.
   * The breach index is what lights a specific block red in the widget.
   */
  verify(): VerifyReport {
    let prevHash = GENESIS_HASH;
    for (const block of this.blocks) {
      const expectedPayloadHash = hashPayload(block.payload);
      if (expectedPayloadHash !== block.payloadHash) {
        return { valid: false, breachIndex: block.index, reason: 'PAYLOAD_TAMPERED', blockCount: this.blocks.length, merkleRoot: null };
      }
      if (block.prevHash !== prevHash) {
        return { valid: false, breachIndex: block.index, reason: 'CHAIN_LINK_BROKEN', blockCount: this.blocks.length, merkleRoot: null };
      }
      const expectedHash = hashBlock(block);
      if (expectedHash !== block.hash) {
        return { valid: false, breachIndex: block.index, reason: 'BLOCK_HASH_MISMATCH', blockCount: this.blocks.length, merkleRoot: null };
      }
      prevHash = block.hash;
    }
    return { valid: true, breachIndex: null, reason: null, blockCount: this.blocks.length, merkleRoot: this.merkleRoot() };
  }

  merkleRoot(): string | null {
    if (this.blocks.length === 0) return null;
    let level = this.blocks.map((b) => b.hash);
    while (level.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : left;
        next.push(createHash('sha256').update(left + right).digest('hex'));
      }
      level = next;
    }
    return level[0];
  }

  /** Sibling hashes proving `index` is included under the current merkle root. */
  merkleProof(index: number): string[] {
    if (index < 0 || index >= this.blocks.length) return [];
    let level = this.blocks.map((b) => b.hash);
    let pos = index;
    const proof: string[] = [];
    while (level.length > 1) {
      const isRight = pos % 2 === 1;
      const siblingIndex = isRight ? pos - 1 : pos + 1;
      const sibling = siblingIndex < level.length ? level[siblingIndex] : level[pos];
      proof.push(sibling);
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : left;
        next.push(createHash('sha256').update(left + right).digest('hex'));
      }
      level = next;
      pos = Math.floor(pos / 2);
    }
    return proof;
  }
}
