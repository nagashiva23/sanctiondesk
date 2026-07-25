import type { EvaluationResult } from './types.js';

/**
 * Plain-English reason-code text. This is what ends up in the adverse
 * action notice a rejected applicant actually reads -- no finance jargon.
 */
const REASON_TEXT: Record<string, (r: EvaluationResult) => string> = {
  HARD_REJECT_ACTIVE_OVERDUE: () =>
    'You have an active overdue amount on an existing loan. We are unable to consider a new loan while that remains outstanding.',
  HARD_REJECT_PAST_DEFAULT: () =>
    'Our records show a past default that exceeds what our policy allows us to look past, regardless of your current income or credit profile.',
  CIBIL_BELOW_FLOOR: () =>
    'Your credit score is below the minimum we require for this product.',
  DTI_EXCEEDS_LIMIT: (r) =>
    `Your total monthly debt obligations after this loan would be about ${fmtGate(r, 'DTI')}% of your income, above our limit.`,
  LTV_OVER_CAP: (r) =>
    `The loan amount requested is too high relative to the value of the asset securing it (${fmtGate(r, 'LTV')}% loan-to-value).`,
  SPEND_TO_INCOME_HIGH: (r) =>
    `Your regular monthly spending is about ${fmtGate(r, 'SPEND_TO_INCOME')}% of your income, above the level we can factor into approval.`,
  EMI_UNAFFORDABLE: () =>
    'The instalment on the requested amount would leave you with no free income each month after your existing commitments.',
  STRESS_TEST_FAIL: () =>
    'If interest rates rose by 2%, this loan\'s instalment would exceed the safety buffer we require against your available monthly surplus.',
  RESIDUAL_INCOME_LOW: () =>
    'After this loan\'s instalment, the income left over each month would fall below the minimum cushion we require.',
  FIOR_THRESHOLD_EXCEEDED: (r) =>
    `Your total monthly loan obligations after this loan would be about ${fmtGate(r, 'FIOR')}% of your income, above our limit for ${r.gates.length ? 'this' : 'your'} employment category.`,
  FIOR_POLICY_UNDEFINED_FOR_OCCUPATION: () =>
    'Our current policy does not define an automated approval path for your employment category. This application has been routed to a credit officer for manual review.',
  FIOR_REDUCTION_BAND: () =>
    'Your obligations relative to income are a little higher than we prefer at the full requested amount, so we can offer this loan at a reduced amount.',
  APPROVED: () => 'Your application meets all policy requirements at the requested amount and tenure.',
};

function fmtGate(result: EvaluationResult, gateName: string): string {
  const gate = result.gates.find((g) => g.gate === gateName);
  if (!gate) return 'n/a';
  return typeof gate.actual === 'number' ? gate.actual.toFixed(1) : String(gate.actual);
}

export function reasonCodeText(code: string, result: EvaluationResult): string {
  const fn = REASON_TEXT[code];
  return fn ? fn(result) : code;
}

export function buildDecisionNarrative(result: EvaluationResult): string {
  return result.reasonCodes.map((code) => reasonCodeText(code, result)).join(' ');
}
