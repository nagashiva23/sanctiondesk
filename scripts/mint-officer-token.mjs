#!/usr/bin/env node
// Mints a short-lived officer JWT for testing the auth-gated tools/resources.
// Not exposed as an MCP tool on purpose -- issuing officer credentials is an
// out-of-band identity concern, not something the public server should do
// for itself. Usage:
//   JWT_SECRET=... node scripts/mint-officer-token.mjs [subject]

import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('Set JWT_SECRET in the environment (same value the server uses) before running this.');
  process.exit(1);
}

const subject = process.argv[2] ?? 'officer-demo';
const token = jwt.sign({ sub: subject, scopes: ['officer'] }, secret, { expiresIn: '24h' });

console.log(token);
