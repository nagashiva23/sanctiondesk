import { describe, it, expect } from 'vitest';
import { canonicalize, deepMergePolicy, hashPolicy, seedPolicyRules } from './policy.js';

describe('canonicalize / hashPolicy: key-order independence', () => {
  it('hashes structurally identical objects the same regardless of key insertion order', () => {
    const a = { z: 1, a: { y: 2, x: 3 } };
    const b = { a: { x: 3, y: 2 }, z: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('is deterministic for the same policy rules object', () => {
    const rules = seedPolicyRules();
    expect(hashPolicy(rules)).toBe(hashPolicy(rules));
    expect(hashPolicy(rules)).toBe(hashPolicy(seedPolicyRules()));
  });

  it('changes when a threshold changes', () => {
    const rules = seedPolicyRules();
    const patched = deepMergePolicy(rules, { gates: { cibil: { passMin: 740 } } });
    expect(hashPolicy(patched)).not.toBe(hashPolicy(rules));
  });
});

describe('deepMergePolicy', () => {
  it('patches a nested threshold without mutating the base object', () => {
    const rules = seedPolicyRules();
    const originalPassMin = rules.gates.cibil.passMin;
    const patched = deepMergePolicy(rules, { gates: { cibil: { passMin: 740 } } });
    expect(patched.gates.cibil.passMin).toBe(740);
    expect(rules.gates.cibil.passMin).toBe(originalPassMin);
    // Untouched siblings survive the patch.
    expect(patched.gates.cibil.manualMin).toBe(rules.gates.cibil.manualMin);
    expect(patched.gates.dti).toEqual(rules.gates.dti);
  });

  it('is a no-op when the patch does not change anything', () => {
    const rules = seedPolicyRules();
    const patched = deepMergePolicy(rules, {});
    expect(hashPolicy(patched)).toBe(hashPolicy(rules));
  });
});
