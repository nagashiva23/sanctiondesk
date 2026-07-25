import { Guard, ExecutionContext, Injectable } from '@nitrostack/core';
import { isManagerContext } from './token.js';

export class ManagerOnlyError extends Error {
  constructor() {
    super(
      'This action requires manager authentication. Present a token minted with scripts/mint-token.mjs ' +
        'as arguments._meta: { authorization: "Bearer <token>" } (nested inside the tool call\'s arguments).',
    );
    this.name = 'ManagerOnlyError';
  }
}

/** `@UseGuards(ManagerGuard)` -- the single gate for every manager-only tool. */
@Injectable()
export class ManagerGuard implements Guard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    return isManagerContext(context);
  }
}

/** For conditional in-handler checks (e.g. verify_audit_chain's seal:true branch) where the requirement depends on the input, not just the tool being called. */
export function requireManager(context: ExecutionContext): void {
  if (!isManagerContext(context)) throw new ManagerOnlyError();
}
