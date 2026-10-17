import * as m from '@/paraglide/messages.js';

/**
 * A gesture's code in words (`RuleError`, a refusal): what happened, why, what to do. A code
 * without its own words is said in general terms, never as a code.
 */
export function sayError(code: string, facts: Record<string, string | number> = {}): string {
  const fact = (key: string) => String(facts[key] ?? '');
  const words: Record<string, () => string> = {
    not_allowed: m.errors_not_allowed,
    invalid_input: m.errors_invalid_input,
    not_found: m.errors_not_found,
    contract_not_found: m.errors_contract_not_found,
    obligation_not_found: m.errors_obligation_not_found,
    security_not_found: m.errors_security_not_found,
    already_done: m.errors_already_done,
    already_recovered: m.errors_already_recovered,
    not_a_funding: m.errors_not_a_funding,
    rule_incomplete: m.errors_rule_incomplete,
    period_invalid: m.errors_period_invalid,
    not_of_project: m.errors_not_of_project,
    refused_by_policy: () => m.errors_refused_by_policy({ why: fact('why') }),
    approval_required: () => m.errors_approval_required({ who: fact('who'), why: fact('why') }),
  };
  return (words[code] ?? m.errors_generic)();
}
