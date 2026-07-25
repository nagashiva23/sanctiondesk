import { Injectable } from '@nitrostack/core';
import { hashPolicy, seedPolicyRules, versionPolicy, type PolicyDoc, type PolicyRules } from '../kernel/policy.js';
import { InMemoryPolicyRepository, type PolicyRepository } from './repository.js';

/**
 * Versioned policy store. Storage lives behind PolicyRepository (in-memory
 * today, MongoDB later -- swapping the repository is the only change a
 * durable backend needs). This class enforces three invariants regardless
 * of what's behind the repository:
 *
 *   1. Exactly one document has active:true at any moment.
 *   2. Policy is NEVER updated in place. publish() inserts a new version
 *      and flips the active flag. History is complete and immutable.
 *   3. getActive() serves from cache; if the eventual Mongo-backed
 *      repository can't reach the database, it must fall back to the
 *      bundled seed and set a degraded flag rather than crash the demo.
 */
@Injectable()
export class PolicyStoreService {
  private degraded = false;
  /**
   * Deliberately a field initializer, not a constructor parameter: the DI
   * container falls back to TypeScript's emitted `design:paramtypes` when a
   * class has no explicit `@Injectable({ deps })`, and an interface-typed
   * parameter (PolicyRepository has no runtime representation) erases to
   * `Object` there -- the container would then inject `new Object()`
   * instead of respecting a constructor default. Swapping in a durable
   * repository later means changing this one line, not touching any tool.
   */
  private readonly repo: PolicyRepository = new InMemoryPolicyRepository();

  constructor() {
    this.seed();
  }

  private seed(): void {
    if (this.repo.isEmpty()) {
      this.repo.insert(versionPolicy(seedPolicyRules(), 'v1', true));
    }
  }

  getActive(): PolicyDoc {
    const active = this.repo.findActive();
    if (!active) {
      // Should be unreachable given publish()'s invariant, but a stale
      // rulebook beats a dead demo -- fall back to the seed if it happens.
      this.degraded = true;
      return this.repo.findAll()[0] ?? versionPolicy(seedPolicyRules(), 'v1-fallback', true);
    }
    return active;
  }

  isDegraded(): boolean {
    return this.degraded;
  }

  getByHash(hash: string): PolicyDoc | null {
    return this.repo.findByHash(hash);
  }

  listVersions(): PolicyDoc[] {
    return this.repo.findAll().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Insert a new version and flip active. If the incoming rules hash to the
   * same value as the currently active version, this is a no-op that
   * returns the existing version -- publishing an unchanged rulebook must
   * not fork the history.
   */
  publish(rules: PolicyRules, versionLabel?: string): PolicyDoc {
    const incomingHash = hashPolicy(rules);
    const current = this.getActive();
    if (incomingHash === current.versionHash) {
      return current;
    }
    const existing = this.repo.findByHash(incomingHash);
    if (existing) {
      this.repo.deactivateAll();
      existing.active = true;
      return existing;
    }
    this.repo.deactivateAll();
    const label = versionLabel ?? `v${this.repo.findAll().length + 1}`;
    const doc = versionPolicy(rules, label, true);
    this.repo.insert(doc);
    return doc;
  }
}
