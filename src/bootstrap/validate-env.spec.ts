import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv } from './validate-env.js';

describe('validateEnv', () => {
  const originalRequired = process.env.JWT_REQUIRED;
  const originalSecret = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalRequired === undefined) delete process.env.JWT_REQUIRED;
    else process.env.JWT_REQUIRED = originalRequired;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it('throws when JWT_REQUIRED=true but JWT_SECRET is unset', () => {
    process.env.JWT_REQUIRED = 'true';
    delete process.env.JWT_SECRET;
    expect(() => validateEnv()).toThrow(/JWT_SECRET/);
  });

  it('does not throw when JWT_REQUIRED=true and JWT_SECRET is set', () => {
    process.env.JWT_REQUIRED = 'true';
    process.env.JWT_SECRET = 'a-long-random-value';
    expect(() => validateEnv()).not.toThrow();
  });

  it('does not throw in dev mode (JWT_REQUIRED unset)', () => {
    delete process.env.JWT_REQUIRED;
    delete process.env.JWT_SECRET;
    expect(() => validateEnv()).not.toThrow();
  });
});
