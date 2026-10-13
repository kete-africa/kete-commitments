import { defineCapability, defineDataset, definePermissions } from '@kete/capabilities';
import { exposeRecord } from '@kete/views';
import { z } from 'zod';
import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';
import {
  addObligation,
  addRule,
  addSecurity,
  meetObligation,
  recoverHeld,
  writeContract,
} from './commands/contracts';
import { checkSpending, toRecover } from './domain/contracts';
import {
  agreementsOf,
  findContract,
  obligationRows,
  obligationsDue,
  searchContracts,
  securitiesHeld,
} from './infrastructure/contracts.table';
import {
  contractInput,
  obligationInput,
  obligationRef,
  ruleInput,
  securityInput,
  securityRecovery,
  spendInput,
  type Contract,
} from './contract.record';

/**
 * Who may do what with commitments. Who keeps the contracts reads and writes them; anyone who
 * spends for a project may ask whether its funders allow an expense — that is how an app checks
 * before it commits money.
 */
export const commitmentsPermissions = definePermissions([
  {
    name: 'commitments:read',
    label: words(m.perm_commitments_read),
    description: words(m.perm_commitments_read_body),
    roles: ['owner', 'admin'],
    businessRoles: ['manager'],
  },
  {
    name: 'commitments:manage',
    label: words(m.perm_commitments_manage),
    description: words(m.perm_commitments_manage_body),
    roles: ['owner', 'admin'],
    businessRoles: ['manager'],
  },
  {
    name: 'commitments:check',
    label: words(m.perm_commitments_check),
    description: words(m.perm_commitments_check_body),
    roles: ['owner', 'admin', 'member'],
    businessRoles: ['manager', 'staff'],
  },
]);

export const commitmentsEvents = [
  {
    type: 'contract.written',
    description: 'A contract was written: its id, its kind and its project.',
    classification: 'internal',
    data: z.object({
      contractId: z.string(),
      kind: z.enum(['client', 'supplier', 'funding']),
      projectId: z.string().nullable(),
    }),
  },
] as const;

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export const commitmentsCapabilities = [
  ...exposeRecord<Contract>({
    type: 'contract',
    description: 'the contracts of the organization: with clients, suppliers and funders',
    permission: 'commitments:read',
    title: m.contracts_title,
    empty: m.contracts_empty,
    columns: [
      { key: 'reference', label: m.contract_reference, value: (c) => c.reference },
      { key: 'title', label: m.contract_title, value: (c) => c.title },
      { key: 'party', label: m.contract_party, value: (c) => c.partyName },
      { key: 'kind', label: m.contract_kind, value: (c) => c.kind },
    ],
    list: (db, query) => searchContracts(db, query),
    get: (db, id) => findContract(db, id),
    label: (c) => `${c.reference} — ${c.title}`,
  }),
  defineCapability({
    name: 'obligations_due',
    description:
      'What contracts require by a day (30 days by default): what we owe and what is owed to us, each with the passage it comes from.',
    permission: 'commitments:read',
    autonomy: 1,
    input: z.object({ withinDays: z.number().int().min(0).max(730).default(30) }),
    run: ({ withinDays }, { db }) => obligationsDue(db, inDays(withinDays)),
  }),
  defineCapability({
    name: 'securities_to_recover',
    description: 'Retentions and bonds whose release day came and that were not recovered: money to claim.',
    permission: 'commitments:read',
    autonomy: 1,
    input: z.object({}),
    run: async (_input, { db }) =>
      (await securitiesHeld(db)).filter((held) => toRecover(held, today())),
  }),
  defineCapability({
    name: 'spending_check',
    description:
      'Whether the funding agreements of a project allow an expense — its post, its amount, what it is, its day. Answers allowed, or the refusals with the passage of the agreement each comes from. Apps ask it before they commit money.',
    permission: 'commitments:check',
    autonomy: 1,
    input: spendInput,
    run: async (spend, { db }) =>
      checkSpending(await agreementsOf(db, spend.projectId), { ...spend, post: spend.post ?? null }),
  }),
  defineCapability({
    name: 'contracts_write',
    description: 'Writes a contract with a client, a supplier or a funder.',
    permission: 'commitments:manage',
    autonomy: 3,
    input: contractInput,
    command: writeContract,
    draft: { recordType: 'contract' },
  }),
  defineCapability({
    name: 'obligations_add',
    description: 'Writes an obligation of a contract, with its day and the passage it comes from.',
    permission: 'commitments:manage',
    autonomy: 3,
    input: obligationInput,
    command: addObligation,
    draft: { recordType: 'obligation' },
  }),
  defineCapability({
    name: 'obligations_meet',
    description: 'Says an obligation was met.',
    permission: 'commitments:manage',
    autonomy: 3,
    input: obligationRef.extend({ doneOn: z.iso.date().optional() }),
    command: meetObligation,
    draft: { recordType: 'obligation_met' },
  }),
  defineCapability({
    name: 'securities_add',
    description: 'Writes a retention or a bond held under a contract.',
    permission: 'commitments:manage',
    autonomy: 3,
    input: securityInput,
    command: addSecurity,
    draft: { recordType: 'security' },
  }),
  defineCapability({
    name: 'securities_recover',
    description: 'Says a retention or a bond was recovered.',
    permission: 'commitments:manage',
    autonomy: 3,
    input: securityRecovery,
    command: recoverHeld,
    draft: { recordType: 'security_recovered' },
  }),
  defineCapability({
    name: 'rules_add',
    description:
      'Writes a rule of spending of a funding agreement, with its passage: eligible posts, a ceiling per expense, excluded items, the period.',
    permission: 'commitments:manage',
    autonomy: 3,
    input: ruleInput,
    command: addRule,
    draft: { recordType: 'spending_rule' },
  }),
];

export const commitmentsDatasets = [
  defineDataset({
    name: 'obligations',
    description: 'One row per obligation: its day, its contract, who owes it, and 1 when met.',
    permission: 'commitments:read',
    classification: 'confidential',
    row: z.object({
      dueOn: z.string(),
      contract: z.string(),
      owedBy: z.enum(['us', 'them']),
      label: z.string(),
      done: z.number(),
    }),
    time: 'dueOn',
    measures: ['done'],
    dimensions: ['owedBy', 'contract'],
    rows: (query, { db }) => obligationRows(db, query),
  }),
];
