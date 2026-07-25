import { Guard, ExecutionContext, Injectable } from '@nitrostack/core';
import jwt from 'jsonwebtoken';

/**
 * Two-tier access: applicants get the redacted (RedactForApplicantsInterceptor)
 * view of decision tools with no auth at all; officer-only tools (policy
 * management, fairness audit, tamper demo) require a JWT carrying an
 * "officer" or "admin" scope.
 *
 * Dev/local behaviour: unless JWT_REQUIRED=true is set, every caller is
 * treated as an officer -- this is what "full detail in Studio dev" means.
 * No auth is wired up locally, so there is nothing to redact against; the
 * gate only takes effect once you deploy with JWT_REQUIRED=true and issue
 * real tokens (see scripts/mint-officer-token.mjs).
 */
export function isOfficerContext(context: ExecutionContext): boolean {
  if (process.env.JWT_REQUIRED !== 'true') {
    context.auth = context.auth ?? { subject: 'dev-local', scopes: ['officer'] };
    return true;
  }
  const token = extractBearerToken(context);
  if (!token) return false;
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return false;
    const payload = jwt.verify(token, secret) as { sub?: string; scope?: string; scopes?: string[] };
    const scopes = payload.scopes ?? (payload.scope ? payload.scope.split(' ') : []);
    context.auth = { subject: payload.sub ?? 'unknown', scopes };
    return scopes.includes('officer') || scopes.includes('admin');
  } catch {
    return false;
  }
}

function extractBearerToken(context: ExecutionContext): string | null {
  const header = (context.metadata as Record<string, unknown> | undefined)?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length);
  }
  return null;
}

@Injectable()
export class OfficerGuard implements Guard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    return isOfficerContext(context);
  }
}
