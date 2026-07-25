import { Guard, ExecutionContext, Injectable } from '@nitrostack/core';
import { isPrivilegedContext } from './token.js';

/**
 * Thin backward-compatible wrapper: "officer" now means "holds at least one
 * role scope" (see roles.ts / token.ts for the actual role model). Kept for
 * the call sites that only need a boolean privileged/unprivileged split --
 * case-access.service.ts (officer bypass), redact-for-applicants.interceptor.ts,
 * and the resource handlers, none of which need to know *which* role.
 *
 * Tool-level authorization should use `RequireScopes(...)` from
 * scope.guard.ts instead, which can tell roles apart.
 */
export function isOfficerContext(context: ExecutionContext): boolean {
  return isPrivilegedContext(context);
}

@Injectable()
export class OfficerGuard implements Guard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    return isOfficerContext(context);
  }
}
