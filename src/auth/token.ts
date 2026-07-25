import jwt from 'jsonwebtoken';
import type { ExecutionContext } from '@nitrostack/core';
import { isJtiRevoked } from './token-revocation.service.js';

/**
 * Two-tier auth model: CLIENT (no token -- self-serve, redacted tools) or
 * MANAGER (any validly-signed, non-revoked token). There is exactly one
 * privileged tier, so a token's mere validity is what matters -- it carries
 * no role/scope claims to check, just `sub` (who) and `jti` (for
 * revocation). Shared by the ManagerGuard (manager.guard.ts),
 * CaseAccessService's officer-bypass check, and the redaction interceptor.
 */

export interface ManagerTokenPayload extends jwt.JwtPayload {
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
 * Resolves and caches (on ctx.auth) whether the current caller is a
 * manager. Unless JWT_REQUIRED=true, every caller is auto-treated as a
 * manager -- this is what makes local Studio testing "just work" with no
 * auth client wired up. Never throws -- returns false for a missing,
 * malformed, expired, or revoked token.
 */
export function isManagerContext(ctx: ExecutionContext): boolean {
  if (process.env.JWT_REQUIRED !== 'true') {
    ctx.auth = ctx.auth ?? { subject: 'dev-local', scopes: ['manager'] };
    return true;
  }
  if (ctx.auth) {
    return (ctx.auth.scopes ?? []).includes('manager');
  }

  const token = extractBearerToken(ctx);
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) return false;

  try {
    const payload = jwt.verify(token, secret) as ManagerTokenPayload;
    if (payload.jti && isJtiRevoked(payload.jti)) return false;
    ctx.auth = { subject: payload.sub ?? 'unknown', scopes: ['manager'] };
    return true;
  } catch {
    return false;
  }
}
