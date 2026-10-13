import { RuleError } from '@kete/capabilities';

export * from './rules';

/** A rule of contracts a gesture broke: the screen words its code (`errors_<code>`). */
export class ContractRuleError extends RuleError {
  constructor(
    override readonly code:
      | 'contract_not_found'
      | 'obligation_not_found'
      | 'security_not_found'
      | 'already_done'
      | 'already_recovered'
      | 'not_a_funding'
      | 'rule_incomplete'
      | 'period_invalid'
      | 'not_of_project',
  ) {
    super(code);
    this.name = 'ContractRuleError';
  }
}

export { contractKinds, securityKinds, type ContractKind, type SecurityKind } from './kinds';
