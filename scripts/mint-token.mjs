#!/usr/bin/env node
// Mints a short-lived role JWT for testing the scope-gated tools/resources.
// Not exposed as an MCP tool on purpose -- issuing credentials is an
// out-of-band identity concern, not something the public server should do
// for itself. Usage:
//   JWT_SECRET=... node scripts/mint-token.mjs --role=LOAN_OFFICER [subject]
//
// Valid --role values: LOAN_OFFICER, RISK_COMPLIANCE_OFFICER, POLICY_ADMIN,
// AUDITOR, SUPER_ADMIN (see src/auth/roles.ts for what each one can do).

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const ROLES = ['LOAN_OFFICER', 'RISK_COMPLIANCE_OFFICER', 'POLICY_ADMIN', 'AUDITOR', 'SUPER_ADMIN'];

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('Set JWT_SECRET in the environment (same value the server uses) before running this.');
  process.exit(1);
}

const args = process.argv.slice(2);
const roleArg = args.find((a) => a.startsWith('--role='))?.slice('--role='.length);
const subject = args.find((a) => !a.startsWith('--')) ?? `${(roleArg ?? 'role').toLowerCase()}-demo`;

if (!roleArg || !ROLES.includes(roleArg)) {
  console.error(`Usage: JWT_SECRET=... node scripts/mint-token.mjs --role=<role> [subject]`);
  console.error(`Valid roles: ${ROLES.join(', ')}`);
  process.exit(1);
}

const jti = crypto.randomUUID();
const token = jwt.sign({ sub: subject, role: roleArg, jti }, secret, { expiresIn: '24h' });

console.log(token);
