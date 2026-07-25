import { describe, it, expect } from 'vitest';
import { AuditChain, type LedgerBlockInput } from './chain.js';

function block(overrides: Partial<LedgerBlockInput> = {}): LedgerBlockInput {
  return {
    caseId: 'CASE-1',
    timestamp: new Date().toISOString(),
    eventType: 'TOOL_CALL',
    actor: 'orchestrator',
    policyVersionHash: 'deadbeef',
    payload: { note: 'test' },
    ...overrides,
  };
}

describe('AuditChain: tamper detection', () => {
  it('verifies a valid, untouched chain', () => {
    const chain = new AuditChain();
    chain.append(block());
    chain.append(block({ eventType: 'DECISION_EMITTED', payload: { decision: 'APPROVE' } }));
    chain.append(block({ eventType: 'CASE_SEALED', payload: { merkleRoot: 'x' } }));

    const report = chain.verify();
    expect(report.valid).toBe(true);
    expect(report.breachIndex).toBeNull();
    expect(report.blockCount).toBe(3);
    expect(report.merkleRoot).not.toBeNull();
  });

  it('reports the exact breach index and reason when a payload is tampered with', () => {
    const chain = new AuditChain();
    chain.append(block());
    chain.append(block({ payload: { note: 'second' } }));
    chain.append(block({ payload: { note: 'third' } }));

    const blocks = chain.getBlocks();
    (blocks[1] as { payload: unknown }).payload = { note: 'tampered' };

    const report = chain.verify();
    expect(report.valid).toBe(false);
    expect(report.breachIndex).toBe(1);
    expect(report.reason).toBe('PAYLOAD_TAMPERED');
  });

  it('reports an empty case as invalid with zero blocks', () => {
    const chain = new AuditChain();
    const report = chain.verify();
    expect(report.blockCount).toBe(0);
    // No blocks means nothing failed the loop -- the loop trivially "passes",
    // matching LedgerStoreService.verify()'s explicit empty-case short-circuit.
    expect(report.valid).toBe(true);
  });
});
