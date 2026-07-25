/**
 * Presentation-only copy of the two-tier model described in the main
 * README's "Roles and authentication" section. Duplicated on purpose --
 * this app is a separate Next.js project with its own build, and this is
 * just descriptive text for the dashboard, not auth logic, so it isn't
 * worth coupling the two apps' builds together to share it.
 */
export const MANAGER_INFO = {
  canDo:
    'Approve/reject manual-review cases, publish new policy versions, run fairness and policy-impact ' +
    'analytics, seal and verify a case\'s ledger, see full unredacted decision detail, revoke other manager tokens.',
  cannotDo: 'Nothing else is gated -- a manager token is the one privileged tier.',
};
