import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import type { ExecutionContext } from '@nitrostack/core';
import { resolveAuthContext, hasAnyScope, isPrivilegedContext } from './token.js';
import { TokenRevocationService } from './token-revocation.service.js';
import { RequireScopes } from './scope.guard.js';
import { ALL_SCOPES, ROLE_SCOPES } from './roles.js';

const TEST_SECRET = 'test-secret-do-not-use-in-real-life';

function fakeCtx(metadata?: Record<string, unknown>): ExecutionContext {
  return {
    requestId: 'req-1',
    logger: { info() {}, warn() {}, error() {}, debug() {} } as never,
    metadata: metadata as never,
  };
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe('token.ts: dev mode (JWT_REQUIRED unset)', () => {
  const original = process.env.JWT_REQUIRED;
  beforeEach(() => {
    delete process.env.JWT_REQUIRED;
  });
  afterEach(() => {
    if (original !== undefined) process.env.JWT_REQUIRED = original;
  });

  it('auto-grants every scope with no token at all', () => {
    const ctx = fakeCtx();
    expect(resolveAuthContext(ctx)).toEqual(ALL_SCOPES);
    expect(isPrivilegedContext(ctx)).toBe(true);
    expect(hasAnyScope(ctx, ['policy:write'])).toBe(true);
  });
});

describe('token.ts: enforced mode (JWT_REQUIRED=true)', () => {
  const originalRequired = process.env.JWT_REQUIRED;
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_REQUIRED = 'true';
    process.env.JWT_SECRET = TEST_SECRET;
  });
  afterEach(() => {
    if (originalRequired === undefined) delete process.env.JWT_REQUIRED;
    else process.env.JWT_REQUIRED = originalRequired;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it('grants no scopes with no bearer token', () => {
    const ctx = fakeCtx();
    expect(resolveAuthContext(ctx)).toEqual([]);
    expect(isPrivilegedContext(ctx)).toBe(false);
  });

  it('grants exactly the role matrix scopes for a valid role token', () => {
    const token = jwt.sign({ sub: 'officer-1', role: 'LOAN_OFFICER', jti: 'jti-1' }, TEST_SECRET, { expiresIn: '1h' });
    const ctx = fakeCtx(bearer(token));
    expect(resolveAuthContext(ctx).sort()).toEqual([...ROLE_SCOPES.LOAN_OFFICER].sort());
    expect(hasAnyScope(ctx, ['case:override'])).toBe(true);
    expect(hasAnyScope(ctx, ['policy:write'])).toBe(false);
  });

  it('denies a token signed with the wrong secret', () => {
    const token = jwt.sign({ sub: 'x', role: 'SUPER_ADMIN', jti: 'jti-2' }, 'wrong-secret', { expiresIn: '1h' });
    const ctx = fakeCtx(bearer(token));
    expect(resolveAuthContext(ctx)).toEqual([]);
  });

  it('denies a revoked token even though its signature and role are valid', () => {
    const revocation = new TokenRevocationService();
    const jti = 'jti-revoked';
    revocation.revoke(jti);
    const token = jwt.sign({ sub: 'x', role: 'POLICY_ADMIN', jti }, TEST_SECRET, { expiresIn: '1h' });
    const ctx = fakeCtx(bearer(token));
    expect(resolveAuthContext(ctx)).toEqual([]);
  });

  it('RequireScopes guard denies a role missing the required scope and allows one that has it', async () => {
    const officerToken = jwt.sign({ sub: 'x', role: 'LOAN_OFFICER', jti: 'jti-3' }, TEST_SECRET, { expiresIn: '1h' });
    const adminToken = jwt.sign({ sub: 'y', role: 'POLICY_ADMIN', jti: 'jti-4' }, TEST_SECRET, { expiresIn: '1h' });

    const GuardClass = RequireScopes('policy:write');
    const guard = new GuardClass();

    await expect(guard.canActivate(fakeCtx(bearer(officerToken)))).resolves.toBe(false);
    await expect(guard.canActivate(fakeCtx(bearer(adminToken)))).resolves.toBe(true);
  });
});
