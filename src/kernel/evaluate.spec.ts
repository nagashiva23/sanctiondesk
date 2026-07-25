import { describe, it, expect } from 'vitest';
import { evaluate, decide } from './evaluate.js';
import { seedPolicyRules } from './policy.js';
import type { Application, GateResult } from './types.js';

const policy = seedPolicyRules();

const baseApp: Application = {
  applicantId: 'TEST-1',
  employmentType: 'SALARIED',
  monthlyIncome: 100000,
  monthlyObligations: 5000,
  monthlySpends: 10000,
  dependents: 0,
  cibilScore: 750,
  product: 'PERSONAL',
  requestedAmount: 500000,
  tenureMonths: 60,
  collateralValue: 0,
  coApplicantIncome: 0,
  hasActiveOverdue: false,
  pastDefaultsCount: 0,
};

function gate(overrides: Partial<GateResult> & Pick<GateResult, 'gate' | 'status'>): GateResult {
  return { actual: 0, threshold: 0, unit: 'percent', policyRef: 'policy://active/x', ...overrides };
}

describe('evaluate: hard rejects (step 1, unconditional)', () => {
  it('rejects active overdue regardless of everything else being clean', () => {
    const result = evaluate({ ...baseApp, hasActiveOverdue: true }, policy);
    expect(result.decision).toBe('REJECT');
    expect(result.hardReject).toBe(true);
    expect(result.hardRejectReason).toBe('ACTIVE_OVERDUE');
    expect(result.bindingConstraint).toBeNull();
  });

  it('rejects past defaults over the policy limit', () => {
    const result = evaluate({ ...baseApp, pastDefaultsCount: policy.hardReject.maxPastDefaults + 1 }, policy);
    expect(result.decision).toBe('REJECT');
    expect(result.hardReject).toBe(true);
    expect(result.hardRejectReason).toBe('PAST_DEFAULTS_OVER_LIMIT');
  });

  it('does not hard reject a clean baseline application', () => {
    const result = evaluate(baseApp, policy);
    expect(result.hardReject).toBe(false);
  });
});

describe('evaluate: gate priority order', () => {
  it('reports CIBIL as the binding constraint over a simultaneously-failing DTI', () => {
    const result = evaluate({ ...baseApp, cibilScore: policy.gates.cibil.manualMin - 1, monthlyObligations: 90000 }, policy);
    expect(result.decision).toBe('REJECT');
    expect(result.bindingConstraint).toBe('CIBIL');
  });
});

describe('decide(): manual review outranks FIOR reduction (step ordering)', () => {
  const policyWithFior = seedPolicyRules();

  it('routes to MANUAL_REVIEW even when the FIOR gate alone would qualify for an auto-reduction', () => {
    const gates: GateResult[] = [
      gate({ gate: 'CIBIL', status: 'PASS' }),
      gate({ gate: 'DTI', status: 'MANUAL' }),
      gate({ gate: 'LTV', status: 'PASS' }),
      gate({ gate: 'SPEND_TO_INCOME', status: 'PASS' }),
      gate({ gate: 'EMI_AFFORDABILITY', status: 'PASS' }),
      gate({ gate: 'STRESS_TEST', status: 'PASS' }),
      gate({ gate: 'RESIDUAL_INCOME', status: 'PASS' }),
      // Above the reduction threshold -- would be APPROVE_WITH_REDUCTION if reached.
      gate({ gate: 'FIOR', status: 'PASS', actual: policyWithFior.gates.fior.SALARIED.reductionThreshold + 1 }),
    ];
    const outcome = decide(baseApp, gates, policyWithFior);
    expect(outcome.decision).toBe('MANUAL_REVIEW');
    expect(outcome.bindingConstraint).toBe('DTI');
  });

  it('approves with reduction only once every other gate has already passed', () => {
    const gates: GateResult[] = [
      gate({ gate: 'CIBIL', status: 'PASS' }),
      gate({ gate: 'DTI', status: 'PASS' }),
      gate({ gate: 'LTV', status: 'PASS' }),
      gate({ gate: 'SPEND_TO_INCOME', status: 'PASS' }),
      gate({ gate: 'EMI_AFFORDABILITY', status: 'PASS' }),
      gate({ gate: 'STRESS_TEST', status: 'PASS' }),
      gate({ gate: 'RESIDUAL_INCOME', status: 'PASS' }),
      gate({ gate: 'FIOR', status: 'PASS', actual: policyWithFior.gates.fior.SALARIED.reductionThreshold + 1 }),
    ];
    const outcome = decide(baseApp, gates, policyWithFior);
    expect(outcome.decision).toBe('APPROVE_WITH_REDUCTION');
    expect(outcome.bindingConstraint).toBe('FIOR');
  });

  it('approves outright when FIOR is at or below the reduction threshold', () => {
    const gates: GateResult[] = [
      gate({ gate: 'CIBIL', status: 'PASS' }),
      gate({ gate: 'DTI', status: 'PASS' }),
      gate({ gate: 'LTV', status: 'PASS' }),
      gate({ gate: 'SPEND_TO_INCOME', status: 'PASS' }),
      gate({ gate: 'EMI_AFFORDABILITY', status: 'PASS' }),
      gate({ gate: 'STRESS_TEST', status: 'PASS' }),
      gate({ gate: 'RESIDUAL_INCOME', status: 'PASS' }),
      gate({ gate: 'FIOR', status: 'PASS', actual: policyWithFior.gates.fior.SALARIED.reductionThreshold }),
    ];
    const outcome = decide(baseApp, gates, policyWithFior);
    expect(outcome.decision).toBe('APPROVE');
  });
});

describe('evaluate(): determinism', () => {
  it('is a pure function of (app, policy) -- no clock, no randomness', () => {
    const a = evaluate(baseApp, policy);
    const b = evaluate(baseApp, policy);
    expect(a).toEqual(b);
  });
});
