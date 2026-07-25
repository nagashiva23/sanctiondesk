import jwt from 'jsonwebtoken';
import type { ExecutionContext } from '@nitrostack/core';
import { ALL_SCOPES, resolveScopes, type Scope } from './roles.js';
import { isJtiRevoked } from './token-revocation.service.js';

/**
 * Shared bearer-token handling for both the officer/role JWT (this file) and
 * the per-case JWT (case-access.service.ts) -- both are HS256 tokens signed
 * with the same JWT_SECRET, just carrying different claims, so the
 * extract-and-verify plumbing lives in one place instead of being
 * copy-pasted per guard.
 */

export interface RoleTokenPayload extends jwt.JwtPayload {
  role?: string;
  scopes?: string[];
  jti?: string;
}

export function extractBearerToken(ctx: ExecutionContext): string | null {
  const header = (ctx.metadata as Record<string, unknown> | undefined)?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length);
  }
  return null;
}

/**
 * Resolves and caches (on ctx.auth) the scopes granted to the current
 * caller. Unless JWT_REQUIRED=true, every caller is auto-granted every
 * scope -- this is what makes local Studio testing "just work" with no
 * auth client wired up, same dev/enforced split every guard in this project
 * already uses. Returns [] for a missing, malformed, expired, or revoked
 * token -- never throws, so callers can decide allow/deny for themselves.
 */
export function resolveAuthContext(ctx: ExecutionContext): Scope[] {
  if (process.env.JWT_REQUIRED !== 'true') {
    ctx.auth = ctx.auth ?? { subject: 'dev-local', scopes: [...ALL_SCOPES] };
    return (ctx.auth.scopes ?? []) as Scope[];
  }
  if (ctx.auth) {
    return (ctx.auth.scopes ?? []) as Scope[];
  }

  const token = extractBearerToken(ctx);
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) return [];

  try {
    const payload = jwt.verify(token, secret) as RoleTokenPayload;
    if (payload.jti && isJtiRevoked(payload.jti)) return [];
    const scopes = resolveScopes(payload);
    ctx.auth = {
      subject: payload.sub ?? 'unknown',
      scopes,
      claims: { role: payload.role ?? null, jti: payload.jti ?? null },
    };
    return scopes;
  } catch {
    return [];
  }
}

/** True if the caller holds at least one of the required scopes. */
export function hasAnyScope(ctx: ExecutionContext, required: Scope[]): boolean {
  const granted = resolveAuthContext(ctx);
  return required.some((scope) => granted.includes(scope));
}

/** True if the caller holds ANY scope at all -- the old "is this an officer" boolean, generalized. */
export function isPrivilegedContext(ctx: ExecutionContext): boolean {
  return resolveAuthContext(ctx).length > 0;
}
