#!/usr/bin/env node
// Mints one manager token per teammate in a single command -- convenience
// wrapper around the same signing logic as mint-token.mjs. Usage:
//   node scripts/mint-team-tokens.mjs alice bob carol      (reads JWT_SECRET from .env)
//   JWT_SECRET=... node scripts/mint-team-tokens.mjs alice bob carol   (explicit override)
//
// Two-tier model: no token is the client/applicant tier; every name listed
// here gets a manager token, full stop -- there is no further role to pick.
// Each token expires in 24h; re-run this to reissue after that, or use the
// revoke_token tool to invalidate one early.

import 'dotenv/config';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('Set JWT_SECRET in the environment (same value the server uses) before running this.');
  process.exit(1);
}

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error('Usage: node scripts/mint-team-tokens.mjs <name> [<name> ...]');
  process.exit(1);
}

for (const name of names) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: name, jti }, secret, { expiresIn: '24h' });
  console.log(`${name}:\n${token}\n`);
}
