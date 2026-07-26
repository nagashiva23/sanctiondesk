import { describe, it, expect } from 'vitest';
import type { ExecutionContext } from '@nitrostack/core';
import { RedactForApplicantsInterceptor } from './redact-for-applicants.interceptor.js';

function fakeCtx(): ExecutionContext {
  return {
    requestId: 'req-1',
    logger: { info() {}, warn() {}, error() {}, debug() {} } as never,
    metadata: {} as never,
  };
}

const samplePayload = () => ({
  caseId: 'CASE-1',
  policyVersion: 'v1',
  policyVersionHash: 'deadbeef',
  derived: { effectiveIncome: 100000, dtiPercent: 12.3 },
  gates: [
    { gate: 'CIBIL', status: 'PASS', actual: 750, threshold: 700, unit: 'score', policyRef: 'policy://x', reasonCode: undefined },
  ],
});

describe('RedactForApplicantsInterceptor', () => {
  it('strips `derived` and gate thresholds for every caller -- no manager tier exists', async () => {
    const interceptor = new RedactForApplicantsInterceptor();
    const result = (await interceptor.intercept(fakeCtx(), async () => samplePayload())) as Record<string, unknown>;

    expect(result.derived).toBeUndefined();
    expect(result.policyVersionHash).toBe('deadbeef'); // provenance pointer stays -- not proprietary
    const gates = result.gates as Array<Record<string, unknown>>;
    expect(gates[0].threshold).toBeUndefined();
    expect(gates[0].gate).toBe('CIBIL');
    expect(gates[0].status).toBe('PASS');
  });
});
