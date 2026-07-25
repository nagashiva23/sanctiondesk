import { createHash } from 'crypto';
import { Injectable } from '@nitrostack/core';
import type { Application } from '../kernel/types.js';

/**
 * Deterministically generates a synthetic applicant population for backtesting
 * (simulate_policy_impact) and bias auditing (verify_demographic_parity).
 *
 * IMPORTANT: this is NOT the 3,192-row Kaggle-derived dataset referenced in
 * the original hackathon plan -- we don't have that CSV. This generator
 * follows the same *shape* of derivation the plan describes (deterministic,
 * hashed off an index so it's reproducible; CIBIL split by a credit-history
 * flag; loan amount sized as a multiple of income by product; product
 * derived from tenure) so the fairness-audit tools have something honest and
 * reproducible to operate on, without pretending to be real bank data.
 */
@Injectable()
export class PopulationService {
  generate(size: number): Application[] {
    const applications: Application[] = [];
    for (let i = 0; i < size; i++) {
      applications.push(this.buildOne(i));
    }
    return applications;
  }

  private buildOne(index: number): Application {
    const f = (field: string) => seededFloat(`syn:${index}:${field}`);

    const employmentType = f('employment') < 0.05 ? 'UNEMPLOYED' : f('employment') < 0.65 ? 'SALARIED' : 'SELF_EMPLOYED';
    const gender = f('gender') < 0.5 ? 'FEMALE' : 'MALE';
    const education = f('education') < 0.6 ? 'GRADUATE' : 'NOT_GRADUATE';
    const maritalStatus = f('marital') < 0.55 ? 'MARRIED' : 'SINGLE';

    const creditHistory = f('creditHistory') < 0.75 ? 1 : 0;
    const cibilScore = creditHistory === 1
      ? Math.round(680 + f('cibil') * 180)
      : Math.round(540 + f('cibil') * 140);

    const monthlyIncome = Math.round(20000 + f('income') * 130000);
    const dependents = Math.floor(f('dependents') * 4);
    const monthlyObligations = Math.round(monthlyIncome * (0.05 + f('obligations') * 0.20));
    const monthlySpends = Math.round(monthlyIncome * (0.18 + f('spends') * 0.15));

    const tenureMonths = Math.round(60 + f('tenure') * 300);
    const product = tenureMonths <= 120 ? 'PERSONAL' : tenureMonths <= 240 ? 'AUTO' : 'HOUSING';
    const annualIncome = monthlyIncome * 12;
    const incomeMultiple = product === 'PERSONAL' ? 0.8 : product === 'AUTO' ? 2.0 : 4.0;
    const requestedAmount = Math.round(annualIncome * incomeMultiple * (0.6 + f('amount') * 0.8));
    const collateralValue = product === 'PERSONAL' ? 0 : Math.round(requestedAmount / (0.6 + f('ltv') * 0.3));

    const hasActiveOverdue = f('overdue') < 0.05;
    const pastDefaultsCount = f('defaults') < 0.05 ? 1 : 0;

    return {
      applicantId: `SYN-${index.toString().padStart(4, '0')}`,
      gender,
      education,
      maritalStatus,
      employmentType,
      monthlyIncome,
      monthlyObligations,
      monthlySpends,
      dependents,
      cibilScore,
      product,
      requestedAmount,
      tenureMonths,
      collateralValue,
      coApplicantIncome: 0,
      hasActiveOverdue,
      pastDefaultsCount,
    };
  }
}

function seededFloat(seed: string): number {
  const hash = createHash('sha256').update(seed).digest();
  const int = hash.readUIntBE(0, 6);
  return int / 2 ** 48;
}
