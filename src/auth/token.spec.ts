import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import type { ExecutionContext } from '@nitrostack/core';
import { isManagerContext } from './token.js';
import { TokenRevocationService } from './token-revocation.service.js';
import { ManagerGuard } from './manager.guard.js';

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

  it('treats every caller as a manager with no token at all', () => {
    const ctx = fakeCtx();
    expect(isManagerContext(ctx)).toBe(true);
  });
});

describe('token.ts: enforced mode (JWT_REQUIRED=true) -- two-tier client/manager model', () => {
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

  it('treats a caller with no bearer token as a client (not a manager)', () => {
    const ctx = fakeCtx();
    expect(isManagerContext(ctx)).toBe(false);
  });

  it('treats any validly-signed token as a manager -- no further role to check', () => {
    const token = jwt.sign({ sub: 'alice', jti: 'jti-1' }, TEST_SECRET, { expiresIn: '1h' });
    const ctx = fakeCtx(bearer(token));
    expect(isManagerContext(ctx)).toBe(true);
  });

  it('denies a token signed with the wrong secret', () => {
    const token = jwt.sign({ sub: 'x', jti: 'jti-2' }, 'wrong-secret', { expiresIn: '1h' });
    const ctx = fakeCtx(bearer(token));
    expect(isManagerContext(ctx)).toBe(false);
  });

  it('denies a revoked token even though its signature is valid', () => {
    const revocation = new TokenRevocationService();
    const jti = 'jti-revoked';
    revocation.revoke(jti);
    const token = jwt.sign({ sub: 'x', jti }, TEST_SECRET, { expiresIn: '1h' });
    const ctx = fakeCtx(bearer(token));
    expect(isManagerContext(ctx)).toBe(false);
  });

  it('ManagerGuard denies a client (no token) and allows a manager (valid token)', async () => {
    const managerToken = jwt.sign({ sub: 'alice', jti: 'jti-3' }, TEST_SECRET, { expiresIn: '1h' });
    const guard = new ManagerGuard();

    await expect(guard.canActivate(fakeCtx())).resolves.toBe(false);
    await expect(guard.canActivate(fakeCtx(bearer(managerToken)))).resolves.toBe(true);
  });
});
