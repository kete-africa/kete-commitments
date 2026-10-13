// A funder's rules of spending, pure: what an agreement allows a project to spend, and why it
// refuses. Each refusal cites the passage of the agreement it comes from.

import type { RuleKind } from './kinds';

export { ruleKinds, type RuleKind } from './kinds';

export interface SpendingRule {
  ruleId: string;
  kind: RuleKind;
  /** `eligible_posts`: the posts of the budget the funds may pay. */
  posts: string[];
  /** `single_ceiling`: the most one expense may be, in the currency's smallest unit. */
  amount: number | null;
  /** `excluded_words`: what the funds never pay — « véhicule », « carburant ». */
  words: string[];
  /** The passage of the agreement, as it is written: what a refusal cites. */
  clause: string;
}

export interface Agreement {
  contractId: string;
  reference: string;
  title: string;
  partyName: string | null;
  startsOn: string | null;
  endsOn: string | null;
  rules: SpendingRule[];
}

/** An expense a project is about to make. */
export interface Spend {
  post: string | null;
  amount: number;
  label: string;
  /** The day it is committed. */
  on: string;
}

export interface Refusal {
  kind: RuleKind;
  clause: string;
  agreement: string;
  /** What the rule says, for the words of the refusal: the posts, the ceiling, the word found. */
  detail: string;
}

/** Lower case, without accents: « Véhicule » and « vehicule » are one word. */
export function folded(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** What one agreement refuses of an expense; nothing when it allows it. */
export function refusalsOf(agreement: Agreement, spend: Spend): Refusal[] {
  const refusals: Refusal[] = [];
  const cite = (kind: RuleKind, clause: string, detail: string) =>
    refusals.push({ kind, clause, agreement: agreement.reference, detail });
  for (const rule of agreement.rules) {
    if (rule.kind === 'eligible_posts') {
      const eligible = rule.posts.map(folded);
      if (!spend.post || !eligible.includes(folded(spend.post))) {
        cite(rule.kind, rule.clause, rule.posts.join(', '));
      }
    }
    if (rule.kind === 'single_ceiling' && rule.amount !== null && spend.amount > rule.amount) {
      cite(rule.kind, rule.clause, String(rule.amount));
    }
    if (rule.kind === 'excluded_words') {
      const label = folded(spend.label);
      const found = rule.words.find((word) => word.trim() && label.includes(folded(word)));
      if (found) cite(rule.kind, rule.clause, found);
    }
    if (rule.kind === 'period') {
      const before = agreement.startsOn !== null && spend.on < agreement.startsOn;
      const after = agreement.endsOn !== null && spend.on > agreement.endsOn;
      if (before || after) {
        cite(rule.kind, rule.clause, `${agreement.startsOn ?? ''} → ${agreement.endsOn ?? ''}`);
      }
    }
  }
  return refusals;
}

/** Every agreement funding a project must allow an expense: what any of them refuses, refuses it. */
export function checkSpending(
  agreements: readonly Agreement[],
  spend: Spend,
): { allowed: boolean; refusals: Refusal[]; agreements: string[] } {
  const refusals = agreements.flatMap((agreement) => refusalsOf(agreement, spend));
  return {
    allowed: refusals.length === 0,
    refusals,
    agreements: agreements.map((agreement) => agreement.reference),
  };
}

/** A retention or a bond whose release day came and that is not recovered: money to claim. */
export function toRecover(
  held: { releaseOn: string | null; recoveredOn: string | null },
  today: string,
): boolean {
  return held.recoveredOn === null && held.releaseOn !== null && held.releaseOn <= today;
}
