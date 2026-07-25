import { PromptDecorator as Prompt, ExecutionContext } from '@nitrostack/core';

/**
 * These prompts are published to the client's own prompt picker -- a loan
 * officer can run underwriter_review directly, without an agent in the
 * loop. That is a capability the server publishes to any MCP client, not
 * an internal string.
 *
 * Defining property of underwriter_review: it contains ZERO thresholds,
 * ZERO rates, ZERO limits. It cannot reason from a stale remembered value
 * -- it must read policy:// resources to know anything.
 */
export class SanctionDeskPrompts {
  @Prompt({
    name: 'underwriter_review',
    description: 'Orchestration guide for evaluating a loan application end to end: read policy, assess affordability, run gates, decide, and offer verified counterfactuals on any non-approval.',
    arguments: [
      { name: 'caseId', description: 'The case identifier to evaluate', required: true },
      { name: 'applicationSummary', description: 'Free-text description of the applicant and the loan requested', required: true },
    ],
  })
  async underwriterReview(args: { caseId: string; applicationSummary: string }, ctx: ExecutionContext) {
    ctx.logger.info('Rendering underwriter_review prompt', { caseId: args.caseId });
    return [
      {
        role: 'user' as const,
        content: `Evaluate this loan application for case ${args.caseId}:\n\n${args.applicationSummary}`,
      },
      {
        role: 'assistant' as const,
        content: `I will underwrite this by reading policy live and never assuming a threshold from memory. Steps:

1. Extract structured application fields from the free text (employment type, income, obligations, spends, CIBIL, product, requested amount, tenure, collateral, co-applicant income, active overdue, past defaults).
2. Read policy://active and state the version hash I am working under before evaluating anything.
3. Call assess_affordability to compute DTI, FIOR, spend-to-income, surplus, residual income, and the stressed EMI.
4. Call run_policy_gates and identify the single binding constraint -- the gate that most limits this application. If it is a hard reject, I stop here: no counterfactual can rescue a hard reject.
5. Call sanction_decision to get the authoritative outcome. I never state an approve or reject myself -- sanction_decision is the only source of the outcome, and it is a pure function of the deterministic kernel.
6. If the decision is REJECT or MANUAL_REVIEW (and it is not a hard reject), call simulate_scenario to get verified counterfactual paths, and call find_max_eligible if the applicant specifically asked about the maximum amount. I present only options that have been re-verified by the real policy engine -- never a number I compute myself.
7. If the decision is MANUAL_REVIEW, I explain that a credit officer must review it via submit_human_override; I do not imply an automatic outcome.
8. I can call verify_audit_chain at any point to show the case's tamper-evident audit trail and Merkle root.
9. I can call generate_sanction_letter to produce the applicant-facing letter from the recorded decision.

I hold no thresholds, rates, or limits myself -- every number in my explanation traces to a tool call or a policy:// resource read, recorded in the ledger for case ${args.caseId}.`,
      },
    ];
  }

  @Prompt({
    name: 'adverse_action_notice',
    description: 'Generate the plain-language adverse action notice for a rejected or reduced application, citing the binding constraint and any verified paths to approval.',
    arguments: [
      { name: 'caseId', description: 'The case identifier whose decision should be explained', required: true },
    ],
  })
  async adverseActionNotice(args: { caseId: string }, ctx: ExecutionContext) {
    ctx.logger.info('Rendering adverse_action_notice prompt', { caseId: args.caseId });
    return [
      {
        role: 'user' as const,
        content: `Draft the adverse action notice for case ${args.caseId}.`,
      },
      {
        role: 'assistant' as const,
        content: `I will call generate_sanction_letter for case ${args.caseId} to produce the notice from the recorded DECISION_EMITTED ledger block -- never re-reasoning about the outcome. If the decision was REJECT or MANUAL_REVIEW, I will also call simulate_scenario and include any verified paths to approval, so the notice never leaves the applicant with a bare "no".`,
      },
    ];
  }
}
