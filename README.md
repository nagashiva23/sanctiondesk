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
- Role-scoped authentication (`src/auth`) -- see the role matrix below.
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

Every caller is either the **applicant** tier (no token; case-scoped access
via `CaseAccessService`, redacted responses) or holds a role token minted
with `scripts/mint-token.mjs`. See `src/auth/roles.ts` for the source of
truth.

| Role | Can do | Cannot do |
|---|---|---|
| `LOAN_OFFICER` | `submit_human_override`, seal a case's ledger (`verify_audit_chain` with `seal:true`), read policy versions | Publish policy, run fairness/impact analytics |
| `RISK_COMPLIANCE_OFFICER` | `verify_demographic_parity`, `simulate_policy_impact`, read policy versions | Publish policy, override a case, seal a ledger |
| `POLICY_ADMIN` | `update_policy`, everything RISK_COMPLIANCE_OFFICER can | Override a case, seal a ledger |
| `AUDITOR` | Read-only: seal a ledger, read policy versions, fairness reads | Override a case, publish policy, run impact simulations |
| `SUPER_ADMIN` | Everything above, plus `debug_tamper_ledger_block` (demo only) and `revoke_token` | -- |

Unless `JWT_REQUIRED=true` is set, every caller is auto-granted every scope
-- this is intentional for local NitroStudio testing, which has no auth
client wired up. Before deploying publicly:

```bash
JWT_SECRET=... JWT_REQUIRED=true npm start

# in another shell, per role you need to test:
JWT_SECRET=... node scripts/mint-token.mjs --role=LOAN_OFFICER
JWT_SECRET=... node scripts/mint-token.mjs --role=POLICY_ADMIN
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

Tokens expire after 24h; `revoke_token` (SUPER_ADMIN only) adds a token's
`jti` to an in-memory denylist as a best-effort revocation -- it resets on
restart, so short expiry is the real backstop, not this list.

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
