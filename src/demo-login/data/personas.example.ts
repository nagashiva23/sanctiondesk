/**
 * Copy this file to personas.ts (gitignored -- never commit real tokens)
 * and fill in a fresh token per persona before each demo:
 *
 *   cp src/demo-login/data/personas.example.ts src/demo-login/data/personas.ts
 *   node scripts/mint-team-tokens.mjs alice bob
 *
 * Paste each printed token into the matching persona's `token` field below.
 * Tokens expire in 24h, so regenerate the morning of the demo.
 *
 * Two-tier model: everyone who logs in here is a manager (there's no
 * further role to pick) -- a client is simply anyone chatting with the
 * deployed MCP server directly, no login at all. Usernames/passwords here
 * are intentionally hardcoded and public -- this is a demo-only
 * convenience, not a real login system.
 */
export interface Persona {
  username: string;
  password: string;
  displayName: string;
  token: string;
}

export const PERSONAS: Persona[] = [
  { username: 'alice', password: 'demo123', displayName: 'Alice', token: 'PASTE_MINTED_TOKEN_HERE' },
  { username: 'bob', password: 'demo123', displayName: 'Bob', token: 'PASTE_MINTED_TOKEN_HERE' },
];
