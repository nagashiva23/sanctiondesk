import jwt from 'jsonwebtoken';
import { Injectable, ExecutionContext } from '@nitrostack/core';
import { isOfficerContext } from './officer.guard.js';

/**
 * Prevents one caller from reading another applicant's case just by typing
 * a different caseId -- caseIds are not secret and are not owned by
 * anyone by default. Whoever's tool call first touches a caseId "claims"
 * it and receives a signed, case-scoped token in that tool's response;
 * every subsequent call touching that caseId must present the same token
 * (or officer auth, which bypasses this entirely).
 *
 * Same dev/enforced split as OfficerGuard: unless JWT_REQUIRED=true, every
 * caller is trusted (Studio/local testing has no token-passing set up).
 */
export class CaseAccessDeniedError extends Error {
  constructor(caseId: string) {
    super(
      `Access to case ${caseId} requires the case-access token issued when it was opened (returned as "caseAccessToken" on the first call for this case), passed as "_meta": {"authorization": "Bearer <token>"} on every subsequent call -- or officer authentication.`,
    );
    this.name = 'CaseAccessDeniedError';
  }
}

@Injectable()
export class CaseAccessService {
  /**
   * Call once per case-scoped tool invocation. Returns a freshly minted
   * token when this is the first call to touch caseId (the caller should
   * surface it in the tool's response), or null when no new token needs to
   * be issued (officer, dev mode, or an already-valid token was presented).
   * Throws CaseAccessDeniedError when enforcement is on and the caller has
   * neither officer auth nor a token matching this caseId.
   */
  authorize(caseId: string, caseAlreadyExists: boolean, ctx: ExecutionContext): string | null {
    if (process.env.JWT_REQUIRED !== 'true') return null;
    if (isOfficerContext(ctx)) return null;

    if (!caseAlreadyExists) {
      return this.mint(caseId);
    }

    const token = extractBearerToken(ctx);
    if (!token) throw new CaseAccessDeniedError(caseId);
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new CaseAccessDeniedError(caseId);
    try {
      const payload = jwt.verify(token, secret) as { caseId?: string };
      if (payload.caseId !== caseId) throw new CaseAccessDeniedError(caseId);
      return null;
    } catch {
      throw new CaseAccessDeniedError(caseId);
    }
  }

  private mint(caseId: string): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET must be set to issue case-access tokens (JWT_REQUIRED=true implies this).');
    }
    return jwt.sign({ caseId }, secret, { expiresIn: '24h' });
  }
}

function extractBearerToken(ctx: ExecutionContext): string | null {
  const header = (ctx.metadata as Record<string, unknown> | undefined)?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length);
  }
  return null;
}
