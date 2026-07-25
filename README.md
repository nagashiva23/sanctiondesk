# SanctionDesk

> **Agentic Loan Approval Automation with Versioned Policy & Decision Provenance**  
> Built for the **Amrita University MCP Hackathon 2026** (Track 01: BFSI & FinTech).

[![Framework: NitroStack](https://img.shields.io/badge/Framework-NitroStack-blue)](https://nitrostack.ai)
[![Protocol: MCP](https://img.shields.io/badge/Protocol-MCP-green)](https://modelcontextprotocol.io)
[![Runtime: Node 20.x](https://img.shields.io/badge/Runtime-Node_20.x-339933)](https://nodejs.org)
[![Database: MongoDB Atlas](https://img.shields.io/badge/Database-MongoDB_Atlas-47A248)](https://www.mongodb.com/cloud/atlas)

---

## Executive Summary

Traditional automated lending engines compile credit policy into source code, making threshold adjustments dependent on software release pipelines. Conversely, probabilistic Large Language Models (LLMs) operating directly as underwriters introduce hallucination risks and fail regulatory requirements for decision reproducibility.

**SanctionDesk** solves this by separating process intelligence from policy authority:
1. **Process Intelligence (LLM Orchestrator):** An MCP-driven LLM plans investigations, selects tools, and explains outcomes without holding hardcoded numerical thresholds or emitting autonomous decisions.
2. **Policy Authority (Deterministic Kernel):** A pure, unit-tested TypeScript engine evaluates credit rules, affordability gates, and risk pricing dynamically using version-controlled policies.
3. **Decision Provenance (Cryptographic Hash Chain):** Every decision is cryptographically bound to the SHA-256 hash of the governing policy version, creating a tamper-evident audit ledger compliant with regulatory transparency standards.

---

## Core Differentiators

* **Counterfactual Sanctioning:** Rejections are never bare. The engine binary-searches the constraint space (loan amount, tenure, co-applicant income) for candidate configurations, re-evaluating each candidate through the live policy engine to return only verified approvable paths.
* **Decision Provenance:** The active policy version's SHA-256 hash (`policyVersionHash`) is written directly into each decision block in an append-only ledger. Past decisions can be reproduced under the exact rulebook in force at that timestamp.
* **Live Dynamic Policy:** Rulebooks are stored as versioned JSON documents in MongoDB Atlas exposed as MCP resources (`policy://active`). Threshold changes take effect immediately on subsequent evaluations without code redeployments.

---

## System Architecture
              ┌──────────────────────────────────────────┐
              │   Access Channels (ChatGPT / NitroChat) │
              └────────────────────┬─────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────┐
              │    SanctionDesk MCP Server (NitroStack)  │
              │  ┌────────────────────────────────────┐  │
              │  │ Orchestrator Agent (Process Only)  │  │
              │  └─────────────────┬──────────────────┘  │
              │                    │                     │
              │  ┌─────────────────┴──────────────────┐  │
              │  │ 6 Tools | 4 Resources | 2 Prompts  │  │
              │  └─────────────────┬──────────────────┘  │
              └────────────────────┼─────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                Deterministic Policy Kernel (Pure TS)             │
│  ┌──────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ 7 Gate Checks│  │ Risk Pricing    │  │ Counterfactual Search│  │
│  └──────────────┘  └─────────────────┘  └─────────────────────┘  │
└──────────────────────────────────┬───────────────────────────────┘
                                   │ policyVersionHash
                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Data & Audit Provenance Layer                  │
│  ┌───────────────────────────┐   ┌────────────────────────────┐  │
│  │ MongoDB Policy Store      │   │ Hash-Chained Audit Ledger  │  │
│  │ (Versioned Rulebooks)     │   │ (SHA-256 + Merkle Roots)   │  │
│  └───────────────────────────┘   └────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘


---

## MCP Primitives Surface

### Tools (Actions with Side Effects)
* `assess_affordability`: Computes DTI, FIOR, monthly surplus, and residual income.
* `run_policy_gates`: Evaluates 7 underwriting gates and attaches resolvable `policyRef` URIs.
* `price_loan`: Derives risk-adjusted interest rate, base EMI, stress EMI (+2%), and NIM spread.
* `sanction_decision`: Emits final decision objects and records `DECISION_EMITTED` ledger blocks.
* `find_max_eligible`: Executes binary search for verified counterfactual paths on rejected applications.
* `verify_audit_chain`: Verifies SHA-256 hash chain and Merkle root integrity for a given case.

### Resources (Read-Only Data)
* `policy://active`: Returns current active policy document and `versionHash`.
* `policy://version/{hash}`: Retrieves historic policy rulebooks by hash.
* `case://{caseId}/ledger`: Exposes the complete audit chain for a specific loan case.
* `market://rbi/rates`: Fetches live or cached benchmark cost-of-funds data.

### Prompts (Reusable Workflows)
* `underwriter_review`: Generates structured underwriting notes for cases marked for human review.
* `adverse_action_notice`: Generates plain-English explanation notices for rejected applicants.

---

## Directory Structure

sanctiondesk/
├── src/
│   ├── kernel/                         # Pure TS Engine (No MCP, No I/O)
│   │   ├── types.ts                    # Zod Schemas for Applications, Policies & Decisions
│   │   ├── policy.ts                   # Canonical key sorting & SHA-256 hashing
│   │   ├── scoring.ts                  # Weighted sub-metric scoring algorithms
│   │   ├── pricing.ts                  # Risk-based rate derivation curves
│   │   ├── gates.ts                    # 7 Underwriting gate check definitions
│   │   ├── evaluate.ts                 # Main decision engine priority tree
│   │   └── counterfactual.ts           # Binary search engine for candidate options
│   ├── ledger/
│   │   ├── chain.ts                    # SHA-256 AuditChain and Merkle root logic
│   │   └── store.ts                    # Ledger persistence (MongoDB)
│   ├── policy/
│   │   └── store.ts                    # Policy version store (MongoDB)
│   ├── modules/                        # MCP Server Primitives
│   │   ├── underwriting.tools.ts       # Tool definitions
│   │   ├── policy.resources.ts         # Resource handlers
│   │   └── reports.prompts.ts          # Prompt templates
│   └── widget/
│       └── DecisionCard.tsx            # Chat UI Widget
├── scripts/
│   ├── derivePopulation.ts             # Deterministic synthetic data generator (3,192 profiles)
│   └── seedPolicy.ts                   # Policy v1 seed script
└── tests/
├── kernel.test.ts                  # Vitest suite for core logic
└── counterfactual.test.ts          # Tests for option verification

--

## Quick Start & Setup

### Prerequisites
* Node.js 20.x or higher
* npm 10.x or higher
* MongoDB Atlas instance (or local MongoDB server)

### 1. Installation
Clone the repository and install dependencies:
```bash
git clone [https://github.com/nagashiva23/sanctiondesk.git](https://github.com/nagashiva23/sanctiondesk.git)
cd sanctiondesk
npm install

2. Environment Configuration
Copy .env.example to .env and set your connection parameters:

Bash
cp .env.example .env
Ensure .env includes:

Code snippet
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/sanctiondesk?retryWrites=true&w=majority
DEFAULT_RBI_RATE=6.50
3. Seed Initial Policy
Seed the initial policy document (policy_v1.json) into your MongoDB Atlas cluster:

Bash
npx tsx scripts/seedPolicy.ts
4. Run Development Server
Boot the local NitroStack MCP server:

Bash
npm run dev
5. Run Test Suite
Execute kernel verification tests via Vitest:

Bash
npm test
Hackathon Compliance Declarations (Rules R10–R25)
R10 (MCP Primitives): Implements all three MCP primitives (6 Tools, 4 Resources, 2 Prompts).

R11 (Originality): Built inside the 24-hour hackathon window using NitroStack CLI.

R12 (Declarations):

Applicant Data: Synthetic population of 3,192 profiles generated deterministically.

Credit Bureau: Mocked fixture service (no public CIBIL API exists in India).

External Feeds: RBI cost-of-funds open data with cached JSON fallback.

R13 (Deployment): Server deployed on NitroCloud and accessible via public endpoint.


R14 (Track): Track 01 — BFSI & FinTech.


---

You can commit this file directly to your repository:
```bash
git add README.md
git commit -m "docs: add comprehensive project README"
git push origin main
