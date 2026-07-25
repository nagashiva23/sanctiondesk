import { createHash } from 'crypto';
import { z } from 'zod';

/**
 * Policy is an ARGUMENT, never an import. Every kernel function that needs
 * thresholds takes a PolicyRules object as a parameter. Nothing in this file
 * or in evaluate.ts/counterfactual.ts reads a threshold from a module
 * constant, a hardcoded number, or an env var.
 */

export const ProductPolicySchema = z.object({
  tenureRangeMonths: z.tuple([z.number(), z.number()]),
  ltvCapPercent: z.number().nullable(),
  baseRatePercent: z.number(),
  costOfFundsPercent: z.number(),
});
export type ProductPolicy = z.infer<typeof ProductPolicySchema>;

export const FiorBandSchema = z.object({
  reductionThreshold: z.number(),
  occupationCeiling: z.number(),
  manualCeiling: z.number(),
});
export type FiorBand = z.infer<typeof FiorBandSchema>;

export const PolicyRulesSchema = z.object({
  products: z.object({
    PERSONAL: ProductPolicySchema,
    AUTO: ProductPolicySchema,
    HOUSING: ProductPolicySchema,
  }),
  gates: z.object({
    cibil: z.object({ passMin: z.number(), manualMin: z.number() }),
    dti: z.object({ passMax: z.number(), manualMax: z.number() }),
    ltv: z.object({ manualOverCapPp: z.number() }),
    spendToIncome: z.object({ passMax: z.number(), manualMax: z.number() }),
    stressTest: z.object({ rateStressPp: z.number(), surplusCeilingPercent: z.number() }),
    residualIncome: z.object({ floorPercentOfSurplus: z.number() }),
    // Deliberately keyed only by SALARIED / SELF_EMPLOYED. UNEMPLOYED has no
    // band on purpose -- see the fairness-audit finding in the plan doc.
    fior: z.object({
      SALARIED: FiorBandSchema,
      SELF_EMPLOYED: FiorBandSchema,
    }),
  }),
  hardReject: z.object({
    allowActiveOverdue: z.boolean(),
    maxPastDefaults: z.number(),
  }),
});
export type PolicyRules = z.infer<typeof PolicyRulesSchema>;

export const PolicyDocSchema = z.object({
  versionHash: z.string(),
  versionLabel: z.string(),
  createdAt: z.string(),
  active: z.boolean(),
  rules: PolicyRulesSchema,
});
export type PolicyDoc = z.infer<typeof PolicyDocSchema>;

/**
 * Recursively sort object keys before serializing so that two structurally
 * identical policies -- regardless of key order -- hash identically.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Deep-merge a partial patch onto a policy rules object without mutating
 * either input. Used by the update_policy tool so a credit officer can
 * patch a single threshold (e.g. gates.cibil.passMin) without restating
 * the entire rulebook.
 */
export function deepMergePolicy<T>(base: T, patch: unknown): T {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return (patch === undefined ? base : (patch as T));
  }
  if (base === null || typeof base !== 'object' || Array.isArray(base)) {
    return patch as T;
  }
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    result[key] = deepMergePolicy((base as Record<string, unknown>)[key], value);
  }
  return result as T;
}

export function hashPolicy(rules: PolicyRules): string {
  return createHash('sha256').update(canonicalize(rules)).digest('hex');
}

export function shortHash(hash: string): string {
  return hash.slice(0, 8);
}

export function versionPolicy(rules: PolicyRules, versionLabel: string, active = true): PolicyDoc {
  return {
    versionHash: hashPolicy(rules),
    versionLabel,
    createdAt: new Date().toISOString(),
    active,
    rules,
  };
}

/**
 * The seed rulebook, content supplied by the plan's gate spec (3.3) and
 * FIOR reason-code examples (8.2). A credit officer replaces this at
 * decision time via PolicyStoreService.publish(); nothing here is baked
 * into the kernel.
 */
export function seedPolicyRules(): PolicyRules {
  return {
    products: {
      PERSONAL: { tenureRangeMonths: [60, 120], ltvCapPercent: null, baseRatePercent: 14.0, costOfFundsPercent: 7.5 },
      AUTO: { tenureRangeMonths: [121, 240], ltvCapPercent: 85, baseRatePercent: 10.5, costOfFundsPercent: 7.5 },
      HOUSING: { tenureRangeMonths: [241, 360], ltvCapPercent: 80, baseRatePercent: 8.8, costOfFundsPercent: 7.5 },
    },
    gates: {
      cibil: { passMin: 700, manualMin: 650 },
      dti: { passMax: 40, manualMax: 55 },
      ltv: { manualOverCapPp: 5 },
      spendToIncome: { passMax: 50, manualMax: 70 },
      stressTest: { rateStressPp: 2, surplusCeilingPercent: 85 },
      residualIncome: { floorPercentOfSurplus: 15 },
      fior: {
        SALARIED: { reductionThreshold: 40, occupationCeiling: 50, manualCeiling: 60 },
        SELF_EMPLOYED: { reductionThreshold: 35, occupationCeiling: 45, manualCeiling: 55 },
      },
    },
    hardReject: { allowActiveOverdue: false, maxPastDefaults: 0 },
  };
}
