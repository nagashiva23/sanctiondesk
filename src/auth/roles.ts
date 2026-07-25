/**
 * Single source of truth for the role/scope model. A JWT carries either a
 * `role` claim (looked up here) or an explicit `scopes` array (trusted
 * as-is) -- see token.ts. Adding a role or a scope only ever means editing
 * this file; every guard, interceptor, and resource reads from it.
 */

export const SCOPES = [
  'case:override', // submit_human_override
  'case:seal', // verify_audit_chain seal:true
  'policy:read', // list_policy_versions
  'policy:write', // update_policy
  'policy:simulate', // simulate_policy_impact
  'fairness:read', // verify_demographic_parity
  'debug:tamper', // debug_tamper_ledger_block (also hard-blocked in production regardless of scope)
] as const;
export type Scope = (typeof SCOPES)[number];

export function isScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}

export const ROLES = ['LOAN_OFFICER', 'RISK_COMPLIANCE_OFFICER', 'POLICY_ADMIN', 'AUDITOR', 'SUPER_ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * Applicants are not a token-bearing role -- an unauthenticated caller (or,
 * once JWT_REQUIRED=true, anyone without a recognized role/scope) is the
 * applicant tier by default, covered by CaseAccessService's per-case token
 * model rather than anything here.
 */
export const ROLE_SCOPES: Record<Role, Scope[]> = {
  LOAN_OFFICER: ['case:override', 'case:seal', 'policy:read'],
  RISK_COMPLIANCE_OFFICER: ['fairness:read', 'policy:simulate', 'policy:read'],
  POLICY_ADMIN: ['policy:write', 'policy:simulate', 'policy:read', 'fairness:read'],
  AUDITOR: ['case:seal', 'policy:read', 'fairness:read'],
  SUPER_ADMIN: [...SCOPES],
};

export const ALL_SCOPES: Scope[] = [...SCOPES];

/** Resolves a JWT's granted scopes: explicit `scopes` win; otherwise fall back to the role's matrix. */
export function resolveScopes(payload: { role?: string; scopes?: string[] }): Scope[] {
  if (payload.scopes) return payload.scopes.filter(isScope);
  if (payload.role && isRole(payload.role)) return ROLE_SCOPES[payload.role];
  return [];
}
