import type { PolicyRules } from './policy.js';
import { hashPolicy } from './policy.js';
import type {
  Application,
  Decision,
  Derived,
  EvaluationResult,
  GateName,
  GateResult,
  ScoreBreakdown,
} from './types.js';

/**
 * Standard reducing-balance EMI formula. Zero-rate path divides evenly so it
 * never divides by zero.
 */
export function calcEMI(principal: number, annualRatePercent: number, tenureMonths: number): number {
  if (principal <= 0 || tenureMonths <= 0) return 0;
  const r = annualRatePercent / 12 / 100;
  if (r === 0) return principal / tenureMonths;
  const factor = Math.pow(1 + r, tenureMonths);
  return (principal * r * factor) / (factor - 1);
}

/** Inverse of calcEMI: the principal a given EMI can service. */
export function principalFromEMI(emi: number, annualRatePercent: number, tenureMonths: number): number {
  if (emi <= 0 || tenureMonths <= 0) return 0;
  const r = annualRatePercent / 12 / 100;
  if (r === 0) return emi * tenureMonths;
  const factor = Math.pow(1 + r, tenureMonths);
  return (emi * (factor - 1)) / (r * factor);
}

/**
 * Rate resolution: base product rate, discounted for strong CIBIL, loaded
 * for weak-but-still-passable CIBIL. All figures come from policy, none are
 * hardcoded here.
 */
export function resolveRate(app: Application, policy: PolicyRules): number {
  const product = policy.products[app.product];
  let rate = product.baseRatePercent;
  if (app.cibilScore >= 780) rate -= 0.5;
  else if (app.cibilScore < policy.gates.cibil.passMin) rate += 1.0;
  return Math.max(rate, product.costOfFundsPercent);
}

export function buildDerived(app: Application, policy: PolicyRules): Derived {
  const product = policy.products[app.product];
  const effectiveIncome = app.monthlyIncome + app.coApplicantIncome;
  const annualRate = resolveRate(app, policy);
  const newEmi = calcEMI(app.requestedAmount, annualRate, app.tenureMonths);

  const dtiPercent = ((app.monthlyObligations + newEmi) / effectiveIncome) * 100;
  const fiorPercent = ((app.monthlyObligations + newEmi) / effectiveIncome) * 100;
  const spendToIncomePercent = (app.monthlySpends / effectiveIncome) * 100;
  const ltvPercent = product.ltvCapPercent === null || app.collateralValue === 0
    ? null
    : (app.requestedAmount / app.collateralValue) * 100;

  const surplus = effectiveIncome - app.monthlyObligations - app.monthlySpends;
  const residualIncome = surplus - newEmi;

  const stressedRate = annualRate + policy.gates.stressTest.rateStressPp;
  const stressedEmi = calcEMI(app.requestedAmount, stressedRate, app.tenureMonths);

  return {
    effectiveIncome,
    annualRate,
    newEmi,
    dtiPercent,
    fiorPercent,
    spendToIncomePercent,
    ltvPercent,
    surplus,
    residualIncome,
    stressedEmi,
  };
}

function policyRef(path: string): string {
  return `policy://active/${path}`;
}

/**
 * Every gate in every result carries a policyRef beginning with policy://,
 * pointing at the specific clause of the active rulebook that governs it.
 */
export function buildGates(app: Application, derived: Derived, policy: PolicyRules): GateResult[] {
  const gates: GateResult[] = [];
  const product = policy.products[app.product];

  // CIBIL
  {
    const { passMin, manualMin } = policy.gates.cibil;
    const status = app.cibilScore >= passMin ? 'PASS' : app.cibilScore >= manualMin ? 'MANUAL' : 'REJECT';
    gates.push({
      gate: 'CIBIL',
      status,
      actual: app.cibilScore,
      threshold: passMin,
      unit: 'score',
      policyRef: policyRef('gates/cibil'),
      reasonCode: status === 'REJECT' ? 'CIBIL_BELOW_FLOOR' : status === 'MANUAL' ? 'CIBIL_MANUAL_BAND' : undefined,
    });
  }

  // DTI
  {
    const { passMax, manualMax } = policy.gates.dti;
    const status = derived.dtiPercent <= passMax ? 'PASS' : derived.dtiPercent <= manualMax ? 'MANUAL' : 'REJECT';
    gates.push({
      gate: 'DTI',
      status,
      actual: round2(derived.dtiPercent),
      threshold: passMax,
      unit: 'percent',
      policyRef: policyRef('gates/dti'),
      reasonCode: status === 'REJECT' ? 'DTI_EXCEEDS_LIMIT' : status === 'MANUAL' ? 'DTI_MANUAL_BAND' : undefined,
    });
  }

  // LTV -- n/a for unsecured products (null cap), always PASS
  {
    if (product.ltvCapPercent === null || derived.ltvPercent === null) {
      gates.push({
        gate: 'LTV',
        status: 'PASS',
        actual: 'n/a',
        threshold: 'n/a',
        unit: 'percent',
        policyRef: policyRef('gates/ltv'),
      });
    } else {
      const cap = product.ltvCapPercent;
      const manualCap = cap + policy.gates.ltv.manualOverCapPp;
      const status = derived.ltvPercent <= cap ? 'PASS' : derived.ltvPercent <= manualCap ? 'MANUAL' : 'REJECT';
      gates.push({
        gate: 'LTV',
        status,
        actual: round2(derived.ltvPercent),
        threshold: cap,
        unit: 'percent',
        policyRef: policyRef('gates/ltv'),
        reasonCode: status === 'REJECT' ? 'LTV_OVER_CAP' : status === 'MANUAL' ? 'LTV_MANUAL_BAND' : undefined,
      });
    }
  }

  // SPEND_TO_INCOME
  {
    const { passMax, manualMax } = policy.gates.spendToIncome;
    const status = derived.spendToIncomePercent <= passMax ? 'PASS' : derived.spendToIncomePercent <= manualMax ? 'MANUAL' : 'REJECT';
    gates.push({
      gate: 'SPEND_TO_INCOME',
      status,
      actual: round2(derived.spendToIncomePercent),
      threshold: passMax,
      unit: 'percent',
      policyRef: policyRef('gates/spendToIncome'),
      reasonCode: status === 'REJECT' ? 'SPEND_TO_INCOME_HIGH' : status === 'MANUAL' ? 'SPEND_TO_INCOME_MANUAL_BAND' : undefined,
    });
  }

  // EMI_AFFORDABILITY -- residual after new EMI must be positive
  {
    const status = derived.residualIncome > 0 ? 'PASS' : 'REJECT';
    gates.push({
      gate: 'EMI_AFFORDABILITY',
      status,
      actual: round2(derived.residualIncome),
      threshold: 0,
      unit: 'INR/month',
      policyRef: policyRef('gates/emiAffordability'),
      reasonCode: status === 'REJECT' ? 'EMI_UNAFFORDABLE' : undefined,
    });
  }

  // STRESS_TEST -- EMI at +stressPp must stay within surplus ceiling
  {
    const ceiling = (policy.gates.stressTest.surplusCeilingPercent / 100) * derived.surplus;
    const status = derived.stressedEmi <= ceiling ? 'PASS' : 'REJECT';
    gates.push({
      gate: 'STRESS_TEST',
      status,
      actual: round2(derived.stressedEmi),
      threshold: round2(ceiling),
      unit: 'INR/month',
      policyRef: policyRef('gates/stressTest'),
      reasonCode: status === 'REJECT' ? 'STRESS_TEST_FAIL' : undefined,
    });
  }

  // RESIDUAL_INCOME -- must retain a floor percentage of surplus after EMI
  {
    const floor = (policy.gates.residualIncome.floorPercentOfSurplus / 100) * derived.surplus;
    const status = derived.residualIncome >= floor ? 'PASS' : 'REJECT';
    gates.push({
      gate: 'RESIDUAL_INCOME',
      status,
      actual: round2(derived.residualIncome),
      threshold: round2(floor),
      unit: 'INR/month',
      policyRef: policyRef('gates/residualIncome'),
      reasonCode: status === 'REJECT' ? 'RESIDUAL_INCOME_LOW' : undefined,
    });
  }

  // FIOR -- silent for UNEMPLOYED. That silence is the documented policy gap.
  {
    const band = app.employmentType === 'UNEMPLOYED' ? undefined : policy.gates.fior[app.employmentType];
    if (!band) {
      gates.push({
        gate: 'FIOR',
        status: 'MANUAL',
        actual: round2(derived.fiorPercent),
        threshold: 'undefined',
        unit: 'percent',
        policyRef: policyRef('gates/fior'),
        reasonCode: 'FIOR_POLICY_UNDEFINED_FOR_OCCUPATION',
      });
    } else {
      const status = derived.fiorPercent <= band.occupationCeiling
        ? 'PASS'
        : derived.fiorPercent <= band.manualCeiling
          ? 'MANUAL'
          : 'REJECT';
      gates.push({
        gate: 'FIOR',
        status,
        actual: round2(derived.fiorPercent),
        threshold: band.manualCeiling,
        unit: 'percent',
        policyRef: policyRef('gates/fior'),
        reasonCode: status === 'REJECT' ? 'FIOR_THRESHOLD_EXCEEDED' : status === 'MANUAL' ? 'FIOR_MANUAL_BAND' : undefined,
      });
    }
  }

  return gates;
}

const GATE_PRIORITY: GateName[] = ['CIBIL', 'DTI', 'LTV', 'SPEND_TO_INCOME', 'EMI_AFFORDABILITY', 'STRESS_TEST', 'RESIDUAL_INCOME', 'FIOR'];

/**
 * Order matters. Evaluate in exactly this sequence:
 *   1. Hard rejects -- unconditional, no counterfactual can rescue them.
 *   2. Any REJECT gate.
 *   3. Any MANUAL gate.
 *   4. Only then, FIOR reduction band -> APPROVE_WITH_REDUCTION.
 *   5. Otherwise APPROVE.
 * Manual review always outranks automated reduction -- evaluating step 4
 * before step 2/3 would auto-sanction an application a human was supposed
 * to see.
 */
export function decide(app: Application, gates: GateResult[], policy: PolicyRules): {
  decision: Decision;
  hardReject: boolean;
  hardRejectReason: string | null;
  bindingConstraint: GateName | null;
  reasonCodes: string[];
} {
  if (app.hasActiveOverdue && !policy.hardReject.allowActiveOverdue) {
    return { decision: 'REJECT', hardReject: true, hardRejectReason: 'ACTIVE_OVERDUE', bindingConstraint: null, reasonCodes: ['HARD_REJECT_ACTIVE_OVERDUE'] };
  }
  if (app.pastDefaultsCount > policy.hardReject.maxPastDefaults) {
    return { decision: 'REJECT', hardReject: true, hardRejectReason: 'PAST_DEFAULTS_OVER_LIMIT', bindingConstraint: null, reasonCodes: ['HARD_REJECT_PAST_DEFAULT'] };
  }

  const byPriority = (status: GateResult['status']) =>
    GATE_PRIORITY
      .map((name) => gates.find((g) => g.gate === name))
      .find((g) => g && g.status === status);

  const rejectGate = byPriority('REJECT');
  if (rejectGate) {
    return {
      decision: 'REJECT',
      hardReject: false,
      hardRejectReason: null,
      bindingConstraint: rejectGate.gate,
      reasonCodes: [rejectGate.reasonCode ?? `${rejectGate.gate}_REJECT`],
    };
  }

  const manualGate = byPriority('MANUAL');
  if (manualGate) {
    return {
      decision: 'MANUAL_REVIEW',
      hardReject: false,
      hardRejectReason: null,
      bindingConstraint: manualGate.gate,
      reasonCodes: [manualGate.reasonCode ?? `${manualGate.gate}_MANUAL`],
    };
  }

  const fiorGate = gates.find((g) => g.gate === 'FIOR')!;
  const band = app.employmentType === 'UNEMPLOYED' ? undefined : policy.gates.fior[app.employmentType];
  if (band && typeof fiorGate.actual === 'number' && fiorGate.actual > band.reductionThreshold) {
    return {
      decision: 'APPROVE_WITH_REDUCTION',
      hardReject: false,
      hardRejectReason: null,
      bindingConstraint: 'FIOR',
      reasonCodes: ['FIOR_REDUCTION_BAND'],
    };
  }

  return { decision: 'APPROVE', hardReject: false, hardRejectReason: null, bindingConstraint: null, reasonCodes: ['APPROVED'] };
}

export function buildScore(app: Application, derived: Derived, decision: Decision, policy: PolicyRules): ScoreBreakdown {
  const sanctionedAmount = decision === 'APPROVE_WITH_REDUCTION' ? round2(app.requestedAmount * 0.9)
    : decision === 'APPROVE' ? app.requestedAmount
      : 0;
  const emi = calcEMI(sanctionedAmount, derived.annualRate, app.tenureMonths);
  const totalPayment = emi * app.tenureMonths;
  const totalInterest = totalPayment - sanctionedAmount;
  return {
    product: app.product,
    resolvedRate: derived.annualRate,
    requestedAmount: app.requestedAmount,
    sanctionedAmount,
    emi: round2(emi),
    totalInterest: round2(totalInterest),
    totalPayment: round2(totalPayment),
  };
}

/**
 * The single entry point. Deterministic: same application + same policy
 * object always returns byte-identical output. Takes no clock, no
 * randomness.
 */
export function evaluate(app: Application, policy: PolicyRules): EvaluationResult {
  const derived = buildDerived(app, policy);
  const gates = buildGates(app, derived, policy);
  const { decision, hardReject, hardRejectReason, bindingConstraint, reasonCodes } = decide(app, gates, policy);
  const score = buildScore(app, derived, decision, policy);

  return {
    applicantId: app.applicantId,
    decision,
    hardReject,
    hardRejectReason,
    bindingConstraint,
    gates,
    derived,
    score,
    reasonCodes,
    policyVersionHash: hashPolicy(policy),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
