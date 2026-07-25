# MEMORY.md: SanctionDesk Context and Rules

## Project Overview
* Repository: https://github.com/nagashiva23/sanctiondesk
* Track: Track 01: BFSI and FinTech (Amrita University MCP Hackathon 2026)
* Framework: NitroStack (TypeScript MCP Server deployed to NitroCloud)
* Core Purpose: Agentic loan approval automation combining dynamic versioned policies, deterministic decision kernels, and tamper-evident audit provenance.

## Technical Stack and Architecture
* Runtime and Language: Node.js 20.x, Pure TypeScript with strict Zod schemas.
* MCP Framework: `@nitrostack/cli` and `@nitrostack/core` (TypeScript-OAuth template setup).
* Database Layer: MongoDB Atlas (M0 Shared Cluster)
  * `policy_versions` collection: Versioned JSON policies with recursive key-sorted SHA-256 hashes.
  * `ledger_blocks` collection: Append-only SHA-256 hash chain with Merkle roots.
  * `cases` collection: Case index.
* Kernel Engine: Pure TypeScript math and policy engine decoupled from I/O, MCP, and LLMs. Unit-tested with Vitest.

## Strict Architectural Constraints

* Policy as an Argument (Rule 6.1):
  * Every kernel function MUST accept the policy document as an explicit parameter: `evaluate(app: Application, policy: PolicyDoc)`.
  * NEVER import policy thresholds, rate bands, or FIOR limits as module constants or hardcoded numbers.

* Deterministic Evaluation Order:
  * Step 1: Hard Rejects (`activeOverdueAmount > 0` or `pastDefaults >= limit`).
  * Step 2: Gate Rejections (Any gate returning `REJECT`).
  * Step 3: Manual Review Gates (Any gate returning `MANUAL`).
  * Step 4: FIOR Policy Reductions (MUST happen after manual review checks to prevent auto-approving manual review cases with reductions).

* Verified Counterfactual Engine:
  * Binary search algorithms MUST re-evaluate every candidate option using `evaluate(candidateApp, policy)` before returning it.
  * NEVER state or return a candidate loan option that has not been re-verified through a live kernel pass.

* Policy Provenance (`policyVersionHash`):
  * Every `DECISION_EMITTED` ledger block MUST write the `policyVersionHash` of the active rulebook into its header/payload.
  * Canonical policy hashing MUST recursively sort object keys prior to running `crypto.createHash("sha256")`.

## MCP Primitives Surface

### Tools (6)
* `assess_affordability`: DTI, FIOR, surplus, and residual income calculation.
* `run_policy_gates`: Evaluates 7 underwriting gates with `policyRef` URIs attached.
* `price_loan`: Derives risk-based interest rate, EMI, stress EMI (+2%), and NIM spread.
* `sanction_decision`: Emits final decision object and writes `DECISION_EMITTED` block to ledger.
* `find_max_eligible`: Binary searches counterfactual options for rejected applicants.
* `verify_audit_chain`: Verifies SHA-256 chain and Merkle root integrity for a given case.

### Resources (4)
* `policy://active`: Returns current active policy JSON document and version hash.
* `policy://version/{hash}`: Addresses specific past policy versions.
* `case://{caseId}/ledger`: Returns full append-only ledger for a case.
* `market://rbi/rates`: Fetches live/cached RBI cost-of-funds benchmark.

### Prompts (2)
* `underwriter_review`: Generates formatted underwriting summary note for manual review.
* `adverse_action_notice`: Generates plain-English explanation for rejected applicants.

## File Directory Mapping
* `MEMORY.md`: Context and rules for the SanctionDesk project.
