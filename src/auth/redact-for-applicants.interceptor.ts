import { InterceptorInterface, ExecutionContext, Injectable } from '@nitrostack/core';
import { isManagerContext } from './token.js';

/**
 * Applied to the applicant-facing decision tools (assess_affordability,
 * run_policy_gates, sanction_decision). An applicant (client) should see
 * their own outcome, their own numbers, and a plain-English reason -- never
 * the proprietary threshold that produced it. Managers (or any caller in
 * local dev, where no auth is configured) see the full detail unchanged.
 *
 * This is a structural redaction: the raw threshold values never reach the
 * model's context for an unauthenticated caller, so it cannot leak what it
 * never received -- the same principle the kernel already uses to keep the
 * LLM from authoring a decision it was never given the authority to make.
 */
@Injectable()
export class RedactForApplicantsInterceptor implements InterceptorInterface {
  async intercept(context: ExecutionContext, next: () => Promise<unknown>): Promise<unknown> {
    const result = await next();
    if (isManagerContext(context)) return result;
    return redact(result);
  }
}

/** Exported so resource handlers (which don't support interceptors) can apply the same rule. */
export function redactPayload(value: unknown): unknown {
  return redact(value);
}

function redact(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    if (value.length > 0 && looksLikeGateResult(value[0])) {
      return value.map((gate) => ({ gate: gate.gate, status: gate.status, reasonCode: gate.reasonCode }));
    }
    return value.map(redact);
  }

  // policyVersionHash / ledgerRef are deliberately NOT stripped here: they're
  // the provenance pointer this whole project exists to expose (the
  // applicant/auditor should be able to verify which rulebook produced their
  // decision via case://{caseId}/ledger). Only the raw internal computation
  // (`derived`) and each gate's exact threshold/actual are proprietary.
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key === 'derived') continue;
    out[key] = redact(val);
  }
  return out;
}

function looksLikeGateResult(item: unknown): item is { gate: unknown; status: unknown; reasonCode: unknown } {
  return !!item && typeof item === 'object' && 'gate' in item && 'status' in item && 'threshold' in item;
}
