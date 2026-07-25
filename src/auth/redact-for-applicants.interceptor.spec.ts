import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  const originalRequired = process.env.JWT_REQUIRED;
  beforeEach(() => {
    process.env.JWT_REQUIRED = 'true'; // enforced mode: no token in fakeCtx() means "not privileged"
  });
  afterEach(() => {
    if (originalRequired === undefined) delete process.env.JWT_REQUIRED;
    else process.env.JWT_REQUIRED = originalRequired;
  });

  it('strips `derived` and gate thresholds for a non-privileged caller', async () => {
    const interceptor = new RedactForApplicantsInterceptor();
    const result = (await interceptor.intercept(fakeCtx(), async () => samplePayload())) as Record<string, unknown>;

    expect(result.derived).toBeUndefined();
    expect(result.policyVersionHash).toBe('deadbeef'); // provenance pointer stays -- not proprietary
    const gates = result.gates as Array<Record<string, unknown>>;
    expect(gates[0].threshold).toBeUndefined();
    expect(gates[0].gate).toBe('CIBIL');
    expect(gates[0].status).toBe('PASS');
  });

  it('passes the payload through unchanged for a privileged (dev-mode) caller', async () => {
    delete process.env.JWT_REQUIRED; // dev mode: every caller is privileged
    const interceptor = new RedactForApplicantsInterceptor();
    const result = (await interceptor.intercept(fakeCtx(), async () => samplePayload())) as Record<string, unknown>;

    expect(result.derived).toBeDefined();
    const gates = result.gates as Array<Record<string, unknown>>;
    expect(gates[0].threshold).toBe(700);
  });
});
