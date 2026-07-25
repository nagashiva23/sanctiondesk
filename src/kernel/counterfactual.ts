import type { PolicyRules } from './policy.js';
import { evaluate } from './evaluate.js';
import type { Application, CounterfactualOption, EvaluationResult } from './types.js';

const APPROVED_DECISIONS = new Set(['APPROVE', 'APPROVE_WITH_REDUCTION']);
const TENURE_LADDER = [84, 120, 180, 240, 300, 360];
const MAX_ITERATIONS = 40;
const AMOUNT_PRECISION = 5000;
const MAX_CO_APPLICANT_INCOME = 200_000;

function isApprovable(result: EvaluationResult): boolean {
  return APPROVED_DECISIONS.has(result.decision);
}

/**
 * Binary search the largest requested amount (0..original) that still
 * evaluates as approvable. Every candidate is re-run through evaluate() --
 * this function never returns an amount it has not itself verified.
 */
export function findMaxEligible(app: Application, policy: PolicyRules): { amount: number; evaluation: EvaluationResult } | null {
  const base = evaluate(app, policy);
  if (base.hardReject) return null;
  if (isApprovable(base)) return null; // already approved: nothing to search for

  let lo = 0;
  let hi = app.requestedAmount;
  let best: { amount: number; evaluation: EvaluationResult } | null = null;

  for (let i = 0; i < MAX_ITERATIONS && hi - lo > AMOUNT_PRECISION; i++) {
    const mid = Math.round((lo + hi) / 2 / AMOUNT_PRECISION) * AMOUNT_PRECISION;
    const candidateApp: Application = { ...app, requestedAmount: mid };
    const result = evaluate(candidateApp, policy);
    if (isApprovable(result)) {
      best = { amount: mid, evaluation: result };
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return best;
}

function tryExtendTenure(app: Application, policy: PolicyRules): { tenure: number; evaluation: EvaluationResult } | null {
  const [minTenure, maxTenure] = policy.products[app.product].tenureRangeMonths;
  const candidates = TENURE_LADDER.filter((t) => t > app.tenureMonths && t >= minTenure && t <= maxTenure);
  for (const tenure of candidates) {
    const result = evaluate({ ...app, tenureMonths: tenure }, policy);
    if (isApprovable(result)) return { tenure, evaluation: result };
  }
  return null;
}

function tryAddCoApplicant(app: Application, policy: PolicyRules): { income: number; evaluation: EvaluationResult } | null {
  let lo = 0;
  let hi = MAX_CO_APPLICANT_INCOME;
  let best: { income: number; evaluation: EvaluationResult } | null = null;

  const atCeiling = evaluate({ ...app, coApplicantIncome: app.coApplicantIncome + hi }, policy);
  if (!isApprovable(atCeiling)) return null;

  for (let i = 0; i < MAX_ITERATIONS && hi - lo > 1000; i++) {
    const mid = Math.round((lo + hi) / 2 / 1000) * 1000;
    const result = evaluate({ ...app, coApplicantIncome: app.coApplicantIncome + mid }, policy);
    if (isApprovable(result)) {
      best = { income: mid, evaluation: result };
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return best ?? { income: hi, evaluation: atCeiling };
}

/**
 * Search all three strategies and return only verified, re-evaluated
 * options. Never fabricate an approval path: if the blocker is a hard
 * reject, or the application is already approved, this returns [].
 */
export function counterfactuals(app: Application, policy: PolicyRules): CounterfactualOption[] {
  const base = evaluate(app, policy);
  if (base.hardReject || isApprovable(base)) return [];

  const options: CounterfactualOption[] = [];

  const reduced = findMaxEligible(app, policy);
  if (reduced) {
    options.push({
      strategy: 'REDUCE_AMOUNT',
      description: `Reduce the loan amount from ${app.requestedAmount} to ${reduced.amount}`,
      changedField: 'requestedAmount',
      from: app.requestedAmount,
      to: reduced.amount,
      resultingDecision: reduced.evaluation.decision,
      verifiedEvaluation: reduced.evaluation,
    });
  }

  const extended = tryExtendTenure(app, policy);
  if (extended) {
    options.push({
      strategy: 'EXTEND_TENURE',
      description: `Extend the tenure from ${app.tenureMonths} to ${extended.tenure} months`,
      changedField: 'tenureMonths',
      from: app.tenureMonths,
      to: extended.tenure,
      resultingDecision: extended.evaluation.decision,
      verifiedEvaluation: extended.evaluation,
    });
  }

  const coApplicant = tryAddCoApplicant(app, policy);
  if (coApplicant && coApplicant.income > 0) {
    options.push({
      strategy: 'ADD_CO_APPLICANT',
      description: `Add a co-applicant contributing at least ${coApplicant.income} in monthly income`,
      changedField: 'coApplicantIncome',
      from: app.coApplicantIncome,
      to: app.coApplicantIncome + coApplicant.income,
      resultingDecision: coApplicant.evaluation.decision,
      verifiedEvaluation: coApplicant.evaluation,
    });
  }

  // Defence in depth: never let an option that doesn't re-verify slip out,
  // even if a bug is introduced above.
  return options.filter((o) => isApprovable(o.verifiedEvaluation));
}
