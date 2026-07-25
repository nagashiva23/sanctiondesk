import { Injectable } from '@nitrostack/core';

/**
 * Module-level store (not instance state) so both the DI-injected service
 * (used by the revoke_token tool) and the plain isJtiRevoked() function
 * (used by token.ts inside guards, which are constructed with `new
 * GuardClass()` rather than through DI) see the same revocations.
 *
 * In-memory and best-effort: it resets on restart, same documented
 * tradeoff already accepted for the policy store and ledger in this
 * project. A revoked token is simply valid again after a redeploy -- short
 * token expiry (24h, see token minting) is the real backstop, not this list.
 */
const revoked = new Set<string>();

export function isJtiRevoked(jti: string): boolean {
  return revoked.has(jti);
}

@Injectable()
export class TokenRevocationService {
  revoke(jti: string): void {
    revoked.add(jti);
  }

  isRevoked(jti: string): boolean {
    return revoked.has(jti);
  }

  listRevoked(): string[] {
    return [...revoked];
  }
}
