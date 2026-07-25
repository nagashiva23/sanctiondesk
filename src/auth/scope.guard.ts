import { Guard, ExecutionContext, GuardConstructor } from '@nitrostack/core';
import { hasAnyScope } from './token.js';
import type { Scope } from './roles.js';

export class InsufficientScopeError extends Error {
  constructor(required: Scope[]) {
    super(
      `This action requires one of the following scopes: ${required.join(', ')}. ` +
        'Present a role token minted with scripts/mint-token.mjs carrying that scope, or officer/admin authentication.',
    );
    this.name = 'InsufficientScopeError';
  }
}

/** For conditional in-handler checks (e.g. verify_audit_chain's seal:true branch) where the requirement depends on the input, not just the tool being called. */
export function requireScopes(context: ExecutionContext, required: Scope[]): void {
  if (!hasAnyScope(context, required)) throw new InsufficientScopeError(required);
}

/**
 * Guard factory: `@UseGuards(RequireScopes('policy:write'))` denies the
 * call unless the caller holds at least one of the listed scopes (any-of,
 * not all-of -- matches how the role matrix in roles.ts is structured, where
 * one scope is usually granted by exactly one or two roles). Replaces the
 * old blanket `@UseGuards(OfficerGuard)` on the six previously "officer
 * only" tools, now split by role -- see roles.ts for the tool-to-scope
 * mapping.
 */
export function RequireScopes(...required: Scope[]): GuardConstructor {
  return class ScopeGuard implements Guard {
    async canActivate(context: ExecutionContext): Promise<boolean> {
      return hasAnyScope(context, required);
    }
  };
}
