import { Injectable } from '@nitrostack/core';
import { hashPolicy, seedPolicyRules, versionPolicy, type PolicyDoc, type PolicyRules } from '../kernel/policy.js';

/**
 * Versioned policy store, in-memory today, MongoDB later. Three rules this
 * class exists to enforce:
 *
 *   1. Exactly one document has active:true at any moment.
 *   2. Policy is NEVER updated in place. publish() inserts a new version
 *      and flips the active flag. History is complete and immutable.
 *   3. getActive() serves from cache; if the eventual Mongo-backed
 *      implementation can't reach the database, it must fall back to the
 *      bundled seed and set a degraded flag rather than crash the demo.
 */
@Injectable()
export class PolicyStoreService {
  private versions: PolicyDoc[] = [];
  private degraded = false;

  constructor() {
    this.seed();
  }

  private seed(): void {
    this.versions.push(versionPolicy(seedPolicyRules(), 'v1', true));
  }

  getActive(): PolicyDoc {
    const active = this.versions.find((v) => v.active);
    if (!active) {
      // Should be unreachable given publish()'s invariant, but a stale
      // rulebook beats a dead demo -- fall back to the seed if it happens.
      this.degraded = true;
      return this.versions[0] ?? versionPolicy(seedPolicyRules(), 'v1-fallback', true);
    }
    return active;
  }

  isDegraded(): boolean {
    return this.degraded;
  }

  getByHash(hash: string): PolicyDoc | null {
    return this.versions.find((v) => v.versionHash === hash) ?? null;
  }

  listVersions(): PolicyDoc[] {
    return [...this.versions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
    const existing = this.getByHash(incomingHash);
    if (existing) {
      this.versions.forEach((v) => (v.active = v.versionHash === incomingHash));
      return existing;
    }
    this.versions.forEach((v) => (v.active = false));
    const label = versionLabel ?? `v${this.versions.length + 1}`;
    const doc = versionPolicy(rules, label, true);
    this.versions.push(doc);
    return doc;
  }
}
