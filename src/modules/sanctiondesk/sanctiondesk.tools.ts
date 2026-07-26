import {
  ToolDecorator as Tool,
  Injectable,
  Widget,
  ExecutionContext,
  UseInterceptors,
  UsePipes,
  z,
} from '@nitrostack/core';
import { ApplicationSchema, type Application, type EvaluationResult } from '../../kernel/types.js';
import { buildDerived, buildGates, evaluate, resolveRate, calcEMI } from '../../kernel/evaluate.js';
import { counterfactuals, findMaxEligible } from '../../kernel/counterfactual.js';
import { buildDecisionNarrative, reasonCodeText } from '../../kernel/reasonText.js';
import { PolicyStoreService } from '../../policy/store.service.js';
import { LedgerStoreService } from '../../ledger/store.service.js';
import { RedactForApplicantsInterceptor } from '../../auth/redact-for-applicants.interceptor.js';
import { OnTopicPipe } from '../../guardrails/on-topic.pipe.js';
import type { LedgerEventType } from '../../ledger/chain.js';

const CaseApplicationInput = z.object({
  caseId: z.string().min(1).describe('Stable case identifier for this application, e.g. the Loan_ID'),
  application: ApplicationSchema,
});

const CaseIdInput = z.object({ caseId: z.string().min(1) });

/**
 * NitroStack's tools/call handler passes the client's raw arguments
 * straight to the tool handler -- it does NOT run inputSchema through Zod
 * at runtime (inputSchema only produces the JSON Schema advertised in
 * tools/list). Every handler below must therefore parse its own input, or
 * an LLM omitting an optional field (e.g. coApplicantIncome) silently
 * produces `undefined` instead of the schema's declared default, which
 * propagates as NaN through the kernel and false-REJECTs every gate that
 * touches it.
 */

/**
 * This server is client-facing only: loan underwriting tools for the
 * applicant/orchestrator, unauthenticated. Policy management, fairness
 * auditing, human override, and audit-chain sealing are manager
 * operations and live in the Next.js manager console instead -- they are
 * not exposed as MCP tools at all, so there is nothing here to gate.
 *
 * The owner: the kernel decides policy, this controller is the only thing
 * that turns kernel output into MCP tool calls and ledger entries. No
 * threshold lives here -- every number comes from PolicyStoreService.getActive().
 */
@Injectable({ deps: [PolicyStoreService, LedgerStoreService] })
export class SanctionDeskTools {
  constructor(
    private readonly policyStore: PolicyStoreService,
    private readonly ledgerStore: LedgerStoreService,
  ) {}

  private ensureCaseOpened(caseId: string, applicantId: string, policyVersionHash: string): void {
    if (this.ledgerStore.caseExists(caseId)) return;
    this.ledgerStore.append({
      caseId,
      timestamp: new Date().toISOString(),
      eventType: 'CASE_OPENED',
      actor: 'orchestrator',
      policyVersionHash,
      payload: { applicantId },
    });
  }

  private recordPolicyRead(caseId: string, policyVersionHash: string): void {
    this.ledgerStore.append({
      caseId,
      timestamp: new Date().toISOString(),
      eventType: 'POLICY_READ',
      actor: 'orchestrator',
      policyVersionHash,
      payload: { note: 'active policy fetched for evaluation' },
    });
  }

  private recordToolCall(caseId: string, policyVersionHash: string, eventType: LedgerEventType, payload: unknown, actor = 'orchestrator'): void {
    this.ledgerStore.append({
      caseId,
      timestamp: new Date().toISOString(),
      eventType,
      actor,
      policyVersionHash,
      payload,
    });
  }

  @Tool({
    name: 'assess_affordability',
    description:
      'Compute affordability metrics for an application (DTI, FIOR, spend-to-income, surplus, residual income, stressed EMI) against the active policy, without making a decision. Call this first to understand where an applicant stands before running the gates.',
    inputSchema: CaseApplicationInput,
    examples: {
      request: {
        caseId: 'LN-0001',
        application: {
          applicantId: 'LN-0001',
          employmentType: 'SELF_EMPLOYED',
          monthlyIncome: 60000,
          monthlyObligations: 8000,
          monthlySpends: 15000,
          dependents: 2,
          cibilScore: 690,
          product: 'PERSONAL',
          requestedAmount: 500000,
          tenureMonths: 84,
          collateralValue: 0,
          coApplicantIncome: 0,
          hasActiveOverdue: false,
          pastDefaultsCount: 0,
        },
      },
    },
  })
  @UseInterceptors(RedactForApplicantsInterceptor)
  @UsePipes(OnTopicPipe)
  async assessAffordability(rawInput: { caseId: string; application: Application }, ctx: ExecutionContext) {
    const input = CaseApplicationInput.parse(rawInput);
    const policy = this.policyStore.getActive();
    this.ensureCaseOpened(input.caseId, input.application.applicantId, policy.versionHash);
    this.recordPolicyRead(input.caseId, policy.versionHash);
    const derived = buildDerived(input.application, policy.rules);
    this.recordToolCall(input.caseId, policy.versionHash, 'TOOL_CALL', { tool: 'assess_affordability', derived });
    ctx.logger.info('Affordability assessed', { caseId: input.caseId });
    return {
      caseId: input.caseId,
      policyVersion: policy.versionLabel,
      policyVersionHash: policy.versionHash,
      derived,
    };
  }

  @Tool({
    name: 'run_policy_gates',
    description:
      'Run every underwriting gate (CIBIL, DTI, LTV, SPEND_TO_INCOME, EMI_AFFORDABILITY, STRESS_TEST, RESIDUAL_INCOME, FIOR) for an application against the active policy and identify the single binding constraint. Does not emit a final decision -- call sanction_decision for that.',
    inputSchema: CaseApplicationInput,
  })
  @UseInterceptors(RedactForApplicantsInterceptor)
  @UsePipes(OnTopicPipe)
  async runPolicyGates(rawInput: { caseId: string; application: Application }, ctx: ExecutionContext) {
    const input = CaseApplicationInput.parse(rawInput);
    const policy = this.policyStore.getActive();
    this.ensureCaseOpened(input.caseId, input.application.applicantId, policy.versionHash);
    const derived = buildDerived(input.application, policy.rules);
    const gates = buildGates(input.application, derived, policy.rules);
    const rejectOrManual = gates.find((g) => g.status !== 'PASS');
    this.recordToolCall(input.caseId, policy.versionHash, 'TOOL_CALL', { tool: 'run_policy_gates', gates });
    ctx.logger.info('Policy gates evaluated', { caseId: input.caseId, bindingConstraint: rejectOrManual?.gate ?? null });
    return {
      caseId: input.caseId,
      policyVersion: policy.versionLabel,
      policyVersionHash: policy.versionHash,
      gates,
      bindingConstraint: rejectOrManual?.gate ?? null,
    };
  }

  @Tool({
    name: 'price_risk_loan',
    description:
      'Resolve the CIBIL-adjusted interest rate for an application from the active policy and compute EMI (standard reducing-balance amortization), total interest, and total payment. Useful for showing pricing before or independent of a full sanction decision.',
    inputSchema: CaseApplicationInput,
  })
  @UsePipes(OnTopicPipe)
  async priceRiskLoan(rawInput: { caseId: string; application: Application }, ctx: ExecutionContext) {
    const input = CaseApplicationInput.parse(rawInput);
    const policy = this.policyStore.getActive();
    const rate = resolveRate(input.application, policy.rules);
    const emi = calcEMI(input.application.requestedAmount, rate, input.application.tenureMonths);
    const totalPayment = emi * input.application.tenureMonths;
    ctx.logger.info('Loan priced', { caseId: input.caseId, rate });
    return {
      caseId: input.caseId,
      policyVersion: policy.versionLabel,
      policyVersionHash: policy.versionHash,
      resolvedRatePercent: Math.round(rate * 100) / 100,
      emi: Math.round(emi * 100) / 100,
      totalInterest: Math.round((totalPayment - input.application.requestedAmount) * 100) / 100,
      totalPayment: Math.round(totalPayment * 100) / 100,
    };
  }

  @Tool({
    name: 'sanction_decision',
    description:
      'The only tool that emits a final loan outcome. Runs the full deterministic decision engine (hard rejects, gates in priority order, FIOR reduction band) against the active policy and writes a DECISION_EMITTED block carrying the policy version hash to the case ledger. Returns APPROVE, APPROVE_WITH_REDUCTION, MANUAL_REVIEW, or REJECT with the binding constraint and human-readable reason text.',
    inputSchema: CaseApplicationInput,
    examples: {
      request: {
        caseId: 'LN-0001',
        application: {
          applicantId: 'LN-0001',
          employmentType: 'SELF_EMPLOYED',
          monthlyIncome: 60000,
          monthlyObligations: 8000,
          monthlySpends: 15000,
          dependents: 2,
          cibilScore: 690,
          product: 'PERSONAL',
          requestedAmount: 500000,
          tenureMonths: 84,
          collateralValue: 0,
          coApplicantIncome: 0,
          hasActiveOverdue: false,
          pastDefaultsCount: 0,
        },
      },
    },
  })
  @Widget('decision-card')
  @UseInterceptors(RedactForApplicantsInterceptor)
  @UsePipes(OnTopicPipe)
  async sanctionDecision(rawInput: { caseId: string; application: Application }, ctx: ExecutionContext) {
    const input = CaseApplicationInput.parse(rawInput);
    const policy = this.policyStore.getActive();
    this.ensureCaseOpened(input.caseId, input.application.applicantId, policy.versionHash);
    this.recordPolicyRead(input.caseId, policy.versionHash);

    const result = evaluate(input.application, policy.rules);
    const narrative = buildDecisionNarrative(result);

    this.recordToolCall(input.caseId, policy.versionHash, 'DECISION_EMITTED', result);

    ctx.logger.info('Decision emitted', { caseId: input.caseId, decision: result.decision, policyVersionHash: policy.versionHash });

    return {
      caseId: input.caseId,
      policyVersion: policy.versionLabel,
      ...result,
      narrative,
      ledgerRef: `case://${input.caseId}/ledger`,
    };
  }

  @Tool({
    name: 'find_max_eligible',
    description:
      'For a REJECT or MANUAL_REVIEW application, binary-search the largest loan amount (holding tenure and everything else fixed) that re-evaluates as approvable through the real policy engine. Returns null if the application is a hard reject (no counterfactual can rescue it) or already approved (nothing to search for).',
    inputSchema: CaseApplicationInput,
  })
  @UsePipes(OnTopicPipe)
  async findMaxEligibleTool(rawInput: { caseId: string; application: Application }, ctx: ExecutionContext) {
    const input = CaseApplicationInput.parse(rawInput);
    const policy = this.policyStore.getActive();
    const found = findMaxEligible(input.application, policy.rules);
    this.recordToolCall(input.caseId, policy.versionHash, 'COUNTERFACTUAL_GENERATED', { tool: 'find_max_eligible', found: found?.amount ?? null });
    ctx.logger.info('Max eligible search complete', { caseId: input.caseId, found: found?.amount ?? null });
    if (!found) {
      return { caseId: input.caseId, found: false, maxEligibleAmount: null, reason: 'No amount reduction can produce an approvable outcome for this application.' };
    }
    return {
      caseId: input.caseId,
      found: true,
      maxEligibleAmount: found.amount,
      verifiedDecision: found.evaluation.decision,
      emi: found.evaluation.score.emi,
    };
  }

  @Tool({
    name: 'simulate_scenario',
    description:
      'For a REJECT or MANUAL_REVIEW application, search all three counterfactual strategies (reduce amount, extend tenure, add a co-applicant) and return only options that have been re-verified as approvable by the real policy engine. The applicant sees only verified paths -- never a fabricated one. Returns an empty list if the blocker is a hard reject or the application is already approved.',
    inputSchema: CaseApplicationInput,
  })
  @UsePipes(OnTopicPipe)
  async simulateScenario(rawInput: { caseId: string; application: Application }, ctx: ExecutionContext) {
    const input = CaseApplicationInput.parse(rawInput);
    const policy = this.policyStore.getActive();
    const options = counterfactuals(input.application, policy.rules);
    this.recordToolCall(input.caseId, policy.versionHash, 'COUNTERFACTUAL_GENERATED', { tool: 'simulate_scenario', optionCount: options.length });
    ctx.logger.info('Counterfactuals generated', { caseId: input.caseId, count: options.length });
    return { caseId: input.caseId, policyVersionHash: policy.versionHash, options };
  }

  @Tool({
    name: 'generate_sanction_letter',
    description:
      'Generate the human-readable sanction or adverse-action letter for a case from its most recent DECISION_EMITTED ledger block -- the exact record produced by sanction_decision, never regenerated or re-reasoned about.',
    inputSchema: CaseIdInput,
  })
  @UsePipes(OnTopicPipe)
  async generateSanctionLetter(rawInput: { caseId: string }, ctx: ExecutionContext) {
    const input = CaseIdInput.parse(rawInput);
    const blocks = this.ledgerStore.getChain(input.caseId);
    const decisionBlock = [...blocks].reverse().find((b) => b.eventType === 'DECISION_EMITTED');
    if (!decisionBlock) {
      return { caseId: input.caseId, found: false, letter: null };
    }
    const result = decisionBlock.payload as EvaluationResult;
    const reasonLines = result.reasonCodes.map((code) => `- ${reasonCodeText(code, result)}`);
    const isPositive = result.decision === 'APPROVE' || result.decision === 'APPROVE_WITH_REDUCTION';
    const letter = [
      isPositive ? `Your ${result.score.product.toLowerCase()} loan application has been ${result.decision === 'APPROVE_WITH_REDUCTION' ? 'approved at a reduced amount' : 'approved'}.`
        : `We are unable to approve your ${result.score.product.toLowerCase()} loan application at this time.`,
      '',
      ...reasonLines,
      '',
      `Decision reference: ${input.caseId}, policy version ${decisionBlock.policyVersionHash.slice(0, 8)}.`,
    ].join('\n');
    ctx.logger.info('Sanction letter generated', { caseId: input.caseId });
    return { caseId: input.caseId, found: true, decision: result.decision, letter };
  }
}
