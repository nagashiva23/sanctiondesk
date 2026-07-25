# SanctionDesk

Agentic loan underwriting MCP server: a deterministic policy kernel, a
versioned policy store, and a hash-chained audit ledger, exposed to MCP
clients as tools/resources/prompts.

## Guardrail deployment checklist

**The input-side guardrail (`src/guardrails/on-topic.pipe.ts`) is
defense-in-depth only.** It can only inspect text that actually lands inside a
tool-call argument (`applicantName`, `justification`, a policy `versionLabel`,
etc.). It **cannot** stop the client's own LLM from answering an off-topic
question directly from its own knowledge -- a reply like "here's some Java
code" never calls a tool, so it never reaches this server at all.

Before deploying this server anywhere a real user will talk to it, you MUST:

1. Read the `policy://scope-notice` resource this server publishes
   (`sanctiondesk.resources.ts`).
2. Paste that text into the MCP client's system prompt / model instructions
   -- e.g. NitroStudio's **"AI Behavior"** settings field, or the equivalent
   system-prompt field for whatever MCP client you're deploying against.
3. Confirm it actually took effect by asking the deployed assistant an
   obviously off-topic question (e.g. "write me a Java ArrayList example")
   and verifying it declines instead of answering.

Skipping step 2 is the single most common way this class of MCP server ends
up answering unrelated questions in production.

## What This Includes

- `sanctiondesk` module: 15 tools, 5 resources, and 2 prompts covering
  affordability, gating, pricing, decisioning, counterfactuals, audit-chain
  verification, letters, human override, and policy management.
- A deterministic policy kernel (`src/kernel`) -- pure TypeScript, no I/O, no
  MCP, no LLM. Every threshold comes from an explicit `PolicyRules` argument.
- A versioned policy store and a hash-chained, tamper-evident audit ledger
  (`src/policy`, `src/ledger`), each behind a `Repository` interface so a
  durable backend is a drop-in later without touching tool code.
- Two-tier client/manager authentication (`src/auth`) -- see below.
- Vitest suite (`npm test`) and GitHub Actions CI (`.github/workflows/ci.yml`).

## Common Commands

```bash
npm run dev         # start the server (nitrostack-cli dev)
npm run build        # compile + bundle widgets for production
npm start             # build, then start in production mode
npm run typecheck      # tsc --noEmit
npm test                # vitest run
```

## Roles and authentication

Two tiers, nothing in between:

- **Client** -- no token at all. Case-scoped access via `CaseAccessService`,
  redacted responses (no internal thresholds, rates, or bands).
- **Manager** -- any validly-signed, non-revoked token minted with
  `scripts/mint-token.mjs`. Full unredacted detail, plus every gated tool:
  `submit_human_override`, `update_policy`, `simulate_policy_impact`,
  `verify_demographic_parity`, `list_policy_versions`, sealing a case's
  ledger (`verify_audit_chain` with `seal:true`), `revoke_token`, and the
  demo-only `debug_tamper_ledger_block`. There is no further split -- a
  manager token is the one privileged tier. See `src/auth/token.ts`
  (`isManagerContext`) for the source of truth.

Unless `JWT_REQUIRED=true` is set, every caller is auto-treated as a
manager -- this is intentional for local NitroStudio testing, which has no
auth client wired up. Before deploying publicly:

```bash
JWT_SECRET=... JWT_REQUIRED=true npm start

# in another shell:
JWT_SECRET=... node scripts/mint-token.mjs alice
```

Send the minted token as `_meta.authorization` **nested inside the tool
call's `arguments`** -- not as a sibling of `name`/`arguments` in `params`,
which is where a generic MCP client (e.g. the official SDK's
`client.callTool`) puts `_meta` by default. NitroStack's `tools/call` handler
reads `_meta` out of `arguments` (see `server.js`), so it has to be sent like
this:

```json
{
  "name": "submit_human_override",
  "arguments": {
    "caseId": "LN-0001",
    "officerId": "officer-1",
    "decision": "APPROVE",
    "justification": "...",
    "_meta": { "authorization": "Bearer <token>" }
  }
}
```

Tokens expire after 24h; `revoke_token` (any manager) adds a token's `jti`
to an in-memory denylist as a best-effort revocation -- it resets on
restart, so short expiry is the real backstop, not this list.

### Using manager tokens from a chat client (Claude, ChatGPT, etc.)

Consumer chat UIs let you register this server's URL as a connector, but
give you no field to attach a bearer token to individual tool calls --
`_meta` isn't part of any tool's declared input schema, so the model won't
add it on its own. To make a pasted token actually take effect, add this to
wherever the client supports a system prompt / custom instructions (Claude's
custom instructions, a ChatGPT connector's instructions, NitroStudio's "AI
Behavior" field):

> If the user provides an authorization token, include it on every
> subsequent tool call as an extra field: `_meta: { authorization: "Bearer
> <token>" }`, alongside the tool's normal arguments -- even though `_meta`
> isn't listed in the tool's schema.

This is manual and conversational, not real login -- fine for a demo, not a
substitute for wiring the OAuth module already bundled in `@nitrostack/core`
if this needs to be real production auth later.

### Assigning tokens to managers

Whoever holds `JWT_SECRET` (keep this to one or two trusted people, e.g. the
deployer) mints one token per manager, tagging each with their name as the
subject -- there's no role to pick, everyone minted here gets the same
manager tier:

```bash
JWT_SECRET=... node scripts/mint-token.mjs alice
```

Or mint the whole roster in one command with `scripts/mint-team-tokens.mjs`:

```bash
JWT_SECRET=... node scripts/mint-team-tokens.mjs alice bob carol
```

Send each token to that person over a private channel (DM, password
manager) -- never a public channel or a commit, since anyone holding a token
can act as a manager until it expires or is revoked.

Each manager then pastes **their own token** into the conversation with the
assistant (e.g. "my token is eyJhbGc..., use it for this") -- if the client
has the standing instruction from the section above, it gets attached to
every subsequent call as `_meta.authorization` automatically. If someone
leaves mid-session or a token leaks, any manager can invalidate it early
with `revoke_token` rather than waiting out the 24h expiry.

Clients need none of this -- they just chat with the deployed server
directly, no login, no token.

## Storage: still in-memory

`PolicyStoreService` and `LedgerStoreService` are in-memory today (state
resets on process restart) but sit behind `PolicyRepository` /
`LedgerRepository` interfaces (`src/policy/repository.ts`,
`src/ledger/repository.ts`) precisely so a durable backend -- MongoDB or
otherwise -- can be dropped in later as a new repository implementation,
without changing `sanctiondesk.tools.ts` at all.

## NitroStudio

NitroStudio is the recommended way to test and debug this template during
development.

- Download: <https://nitrostack.ai/studio>
- Studio: <https://nitrostack.ai/studio>

## Links

- Docs: <https://docs.nitrostack.ai>
- Templates docs: <https://docs.nitrostack.ai/templates/01-starter-template>
- Main repository: <https://github.com/nitrocloudofficial/nitrostack>

## Community

- Discord: <https://discord.gg/uVWey6UhuD>
- X: <https://x.com/nitrostackai>
- YouTube: <https://www.youtube.com/@nitrostackai>
- LinkedIn: <https://linkedin.com/company/nitrostack-ai/>
- GitHub: <https://github.com/nitrostackai>
