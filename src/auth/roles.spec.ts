import { describe, it, expect } from 'vitest';
import { ALL_SCOPES, ROLE_SCOPES, ROLES, isRole, isScope, resolveScopes } from './roles.js';

describe('role/scope matrix', () => {
  it('gives every role exactly the scopes declared in its matrix entry', () => {
    for (const role of ROLES) {
      expect(resolveScopes({ role })).toEqual(ROLE_SCOPES[role]);
    }
  });

  it('SUPER_ADMIN holds every scope, including debug:tamper', () => {
    expect(ROLE_SCOPES.SUPER_ADMIN).toEqual(ALL_SCOPES);
    expect(ROLE_SCOPES.SUPER_ADMIN).toContain('debug:tamper');
  });

  it('debug:tamper is granted to SUPER_ADMIN only (used as the "super-admin-only" gate for revoke_token)', () => {
    const holders = ROLES.filter((role) => ROLE_SCOPES[role].includes('debug:tamper'));
    expect(holders).toEqual(['SUPER_ADMIN']);
  });

  it('only LOAN_OFFICER and SUPER_ADMIN can submit_human_override (case:override)', () => {
    const holders = ROLES.filter((role) => ROLE_SCOPES[role].includes('case:override'));
    expect(holders.sort()).toEqual(['LOAN_OFFICER', 'SUPER_ADMIN'].sort());
  });

  it('only POLICY_ADMIN and SUPER_ADMIN can update_policy (policy:write)', () => {
    const holders = ROLES.filter((role) => ROLE_SCOPES[role].includes('policy:write'));
    expect(holders.sort()).toEqual(['POLICY_ADMIN', 'SUPER_ADMIN'].sort());
  });

  it('explicit scopes on a token win over its role claim', () => {
    expect(resolveScopes({ role: 'AUDITOR', scopes: ['policy:write'] })).toEqual(['policy:write']);
  });

  it('drops unknown scope strings rather than trusting them', () => {
    expect(resolveScopes({ scopes: ['policy:write', 'not-a-real-scope'] })).toEqual(['policy:write']);
  });

  it('grants nothing for an unrecognized role and no explicit scopes', () => {
    expect(resolveScopes({ role: 'NOT_A_ROLE' })).toEqual([]);
  });

  it('isRole / isScope type guards agree with the canonical lists', () => {
    expect(isRole('POLICY_ADMIN')).toBe(true);
    expect(isRole('nope')).toBe(false);
    expect(isScope('policy:write')).toBe(true);
    expect(isScope('nope')).toBe(false);
  });
});
