#!/usr/bin/env node
// Mints a short-lived manager JWT for testing the manager-gated
// tools/resources. Not exposed as an MCP tool on purpose -- issuing
// credentials is an out-of-band identity concern, not something the public
// server should do for itself. Two-tier model: no token at all is the
// client/applicant tier; any validly-signed token minted here is a
// manager, full stop -- there is no further role differentiation. Usage:
//   node scripts/mint-token.mjs [subject]     (reads JWT_SECRET from .env)
//   JWT_SECRET=... node scripts/mint-token.mjs [subject]   (explicit override)

import 'dotenv/config';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('Set JWT_SECRET in the environment (same value the server uses) before running this.');
  process.exit(1);
}

const subject = process.argv[2] ?? 'manager-demo';
const jti = crypto.randomUUID();
const token = jwt.sign({ sub: subject, jti }, secret, { expiresIn: '24h' });

console.log(token);
