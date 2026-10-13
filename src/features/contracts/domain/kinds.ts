// The kinds of contracts, of securities and of rules, alone: a screen reads them without the rules.

export const contractKinds = ['client', 'supplier', 'funding'] as const;
export type ContractKind = (typeof contractKinds)[number];
export const securityKinds = ['retention', 'bond'] as const;
export type SecurityKind = (typeof securityKinds)[number];
export const ruleKinds = ['eligible_posts', 'single_ceiling', 'excluded_words', 'period'] as const;
export type RuleKind = (typeof ruleKinds)[number];
