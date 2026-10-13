import * as m from '@/paraglide/messages.js';
import type { ContractKind, RuleKind } from '../domain/kinds';

export const kindLabel = (kind: ContractKind): string =>
  ({ client: m.kind_client, supplier: m.kind_supplier, funding: m.kind_funding })[kind]();

export const ruleLabel = (kind: RuleKind): string =>
  ({
    eligible_posts: m.rule_eligible_posts,
    single_ceiling: m.rule_single_ceiling,
    excluded_words: m.rule_excluded_words,
    period: m.rule_period,
  })[kind]();
