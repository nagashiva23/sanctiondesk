import { z } from 'zod';

/**
 * Kernel-level types. No @nitrostack/core import here on purpose: the kernel
 * never touches MCP, the network, or an LLM. It is pure, deterministic TypeScript.
 */

export const ProductSchema = z.enum(['PERSONAL', 'AUTO', 'HOUSING']);
export type Product = z.infer<typeof ProductSchema>;

export const EmploymentTypeSchema = z.enum(['SALARIED', 'SELF_EMPLOYED', 'UNEMPLOYED']);
export type EmploymentType = z.infer<typeof EmploymentTypeSchema>;

export const DecisionSchema = z.enum(['APPROVE', 'APPROVE_WITH_REDUCTION', 'MANUAL_REVIEW', 'REJECT']);
export type Decision = z.infer<typeof DecisionSchema>;

export const GateStatusSchema = z.enum(['PASS', 'MANUAL', 'REJECT']);
export type GateStatus = z.infer<typeof GateStatusSchema>;

export const GateNameSchema = z.enum([
  'CIBIL',
  'DTI',
  'LTV',
  'SPEND_TO_INCOME',
  'EMI_AFFORDABILITY',
  'STRESS_TEST',
  'RESIDUAL_INCOME',
  'FIOR',
]);
export type GateName = z.infer<typeof GateNameSchema>;

/**
 * Every gate carries a resolvable MCP resource URI pointing at the governing
 * clause of the active policy. This is what closes the audit loop.
 */
export const GateResultSchema = z.object({
  gate: GateNameSchema,
  status: GateStatusSchema,
  actual: z.union([z.number(), z.string()]),
  threshold: z.union([z.number(), z.string()]),
  unit: z.string(),
  policyRef: z.string().startsWith('policy://'),
  reasonCode: z.string().optional(),
});
export type GateResult = z.infer<typeof GateResultSchema>;

export const ApplicationSchema = z.object({
  applicantId: z.string().min(1).describe('Stable applicant identifier, e.g. a Loan_ID from the dataset'),
  applicantName: z.string().optional(),
  employmentType: EmploymentTypeSchema,
  monthlyIncome: z.number().positive(),
  monthlyObligations: z.number().min(0).describe('Existing EMI/obligations before this loan'),
  monthlySpends: z.number().min(0),
  dependents: z.number().int().min(0).default(0),
  cibilScore: z.number().int().min(300).max(900),
  product: ProductSchema,
  requestedAmount: z.number().positive(),
  tenureMonths: z.number().int().positive(),
  collateralValue: z.number().min(0).default(0).describe('0 for unsecured personal loans'),
  coApplicantIncome: z.number().min(0).default(0),
  hasActiveOverdue: z.boolean().default(false),
  pastDefaultsCount: z.number().int().min(0).default(0),
});
export type Application = z.infer<typeof ApplicationSchema>;

export const DerivedSchema = z.object({
  effectiveIncome: z.number(),
  annualRate: z.number(),
  newEmi: z.number(),
  dtiPercent: z.number(),
  fiorPercent: z.number(),
  spendToIncomePercent: z.number(),
  ltvPercent: z.number().nullable(),
  surplus: z.number(),
  residualIncome: z.number(),
  stressedEmi: z.number(),
});
export type Derived = z.infer<typeof DerivedSchema>;

export const ScoreBreakdownSchema = z.object({
  product: ProductSchema,
  resolvedRate: z.number(),
  requestedAmount: z.number(),
  sanctionedAmount: z.number(),
  emi: z.number(),
  totalInterest: z.number(),
  totalPayment: z.number(),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const EvaluationResultSchema = z.object({
  applicantId: z.string(),
  decision: DecisionSchema,
  hardReject: z.boolean(),
  hardRejectReason: z.string().nullable(),
  bindingConstraint: GateNameSchema.nullable(),
  gates: z.array(GateResultSchema),
  derived: DerivedSchema,
  score: ScoreBreakdownSchema,
  reasonCodes: z.array(z.string()),
  policyVersionHash: z.string(),
});
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

export const CounterfactualStrategySchema = z.enum(['REDUCE_AMOUNT', 'EXTEND_TENURE', 'ADD_CO_APPLICANT']);
export type CounterfactualStrategy = z.infer<typeof CounterfactualStrategySchema>;

export const CounterfactualOptionSchema = z.object({
  strategy: CounterfactualStrategySchema,
  description: z.string(),
  changedField: z.string(),
  from: z.union([z.number(), z.string()]),
  to: z.union([z.number(), z.string()]),
  resultingDecision: DecisionSchema,
  verifiedEvaluation: EvaluationResultSchema,
});
export type CounterfactualOption = z.infer<typeof CounterfactualOptionSchema>;
