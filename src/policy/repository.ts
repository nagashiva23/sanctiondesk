import type { PolicyDoc } from '../kernel/policy.js';

/**
 * Pure storage boundary for policy versions -- no versioning invariants
 * here (that logic, e.g. "publishing an unchanged rulebook is a no-op",
 * lives in PolicyStoreService, which is storage-agnostic). A future
 * MongoDB-backed implementation only has to satisfy this interface; nothing
 * in sanctiondesk.tools.ts or PolicyStoreService changes.
 */
export interface PolicyRepository {
  insert(doc: PolicyDoc): void;
  findActive(): PolicyDoc | null;
  findByHash(hash: string): PolicyDoc | null;
  findAll(): PolicyDoc[];
  deactivateAll(): void;
  isEmpty(): boolean;
}

/** In-memory today; resets on process restart, same documented tradeoff as the ledger store. */
export class InMemoryPolicyRepository implements PolicyRepository {
  private versions: PolicyDoc[] = [];

  insert(doc: PolicyDoc): void {
    this.versions.push(doc);
  }

  findActive(): PolicyDoc | null {
    return this.versions.find((v) => v.active) ?? null;
  }

  findByHash(hash: string): PolicyDoc | null {
    return this.versions.find((v) => v.versionHash === hash) ?? null;
  }

  findAll(): PolicyDoc[] {
    return [...this.versions];
  }

  deactivateAll(): void {
    this.versions.forEach((v) => (v.active = false));
  }

  isEmpty(): boolean {
    return this.versions.length === 0;
  }
}
