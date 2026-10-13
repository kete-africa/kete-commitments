import { newId } from '@kete/records';
import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import type {
  Agreement,
  ContractKind,
  RuleKind,
  SecurityKind,
  SpendingRule,
} from '../domain/contracts';
import type { Contract, ContractFile, Obligation, Security } from '../contract.record';

/** Contracts, obligations, retentions and bonds, rules of spending — each with its RLS. */
export function contractsMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  const policy = (table: string) =>
    organizationPolicySql({ schema: s, table, appRole: options.appRole });
  return `
create table ${s}.contracts (
  contract_id text primary key,
  organization_id text not null,
  kind text not null check (kind in ('client', 'supplier', 'funding')),
  reference text not null check (length(reference) between 1 and 80),
  title text not null check (length(title) between 1 and 200),
  party_id text,
  party_name text,
  project_id text,
  project_name text,
  amount bigint check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  signed_on date,
  starts_on date,
  ends_on date,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, reference),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index contracts_by_project on ${s}.contracts (organization_id, project_id, kind);
${policy('contracts')}
grant select, insert, update on ${s}.contracts to ${options.appRole};

create table ${s}.obligations (
  obligation_id text primary key,
  organization_id text not null,
  contract_id text not null references ${s}.contracts (contract_id),
  label text not null,
  owed_by text not null check (owed_by in ('us', 'them')),
  due_on date not null,
  clause text not null,
  done_on date,
  done_by text,
  created_at timestamptz not null default now()
);
create index obligations_by_due on ${s}.obligations (organization_id, due_on) where done_on is null;
${policy('obligations')}
grant select, insert, update on ${s}.obligations to ${options.appRole};

create table ${s}.securities (
  security_id text primary key,
  organization_id text not null,
  contract_id text not null references ${s}.contracts (contract_id),
  kind text not null check (kind in ('retention', 'bond')),
  amount bigint not null check (amount > 0),
  release_on date,
  recovered_on date,
  clause text not null,
  created_at timestamptz not null default now()
);
${policy('securities')}
grant select, insert, update on ${s}.securities to ${options.appRole};

create table ${s}.spending_rules (
  rule_id text primary key,
  organization_id text not null,
  contract_id text not null references ${s}.contracts (contract_id),
  kind text not null check (kind in ('eligible_posts', 'single_ceiling', 'excluded_words', 'period')),
  posts text[] not null default '{}',
  amount bigint check (amount >= 0),
  words text[] not null default '{}',
  clause text not null,
  created_at timestamptz not null default now()
);
create index spending_rules_by_contract on ${s}.spending_rules (contract_id);
${policy('spending_rules')}
grant select, insert on ${s}.spending_rules to ${options.appRole};
`;
}

type ContractRow = {
  contract_id: string;
  kind: ContractKind;
  reference: string;
  title: string;
  party_id: string | null;
  party_name: string | null;
  project_id: string | null;
  project_name: string | null;
  amount: string | null;
  currency: string;
  signed_on: string | null;
  starts_on: string | null;
  ends_on: string | null;
};
const contractColumns = `contract_id, kind, reference, title, party_id, party_name, project_id,
  project_name, amount, currency, to_char(signed_on, 'YYYY-MM-DD') as signed_on,
  to_char(starts_on, 'YYYY-MM-DD') as starts_on, to_char(ends_on, 'YYYY-MM-DD') as ends_on`;
const toContract = (row: ContractRow): Contract => ({
  contractId: row.contract_id,
  kind: row.kind,
  reference: row.reference,
  title: row.title,
  partyId: row.party_id,
  partyName: row.party_name,
  projectId: row.project_id,
  projectName: row.project_name,
  amount: row.amount === null ? null : Number(row.amount),
  currency: row.currency,
  signedOn: row.signed_on,
  startsOn: row.starts_on,
  endsOn: row.ends_on,
});

export async function insertContract(
  db: SqlExecutor,
  contract: Omit<Contract, 'contractId'> & { organizationId: string; createdBy: string },
): Promise<string> {
  const contractId = newId('ctr');
  await db.query(
    `insert into contracts
       (contract_id, organization_id, kind, reference, title, party_id, party_name, project_id,
        project_name, amount, currency, signed_on, starts_on, ends_on, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      contractId,
      contract.organizationId,
      contract.kind,
      contract.reference,
      contract.title,
      contract.partyId,
      contract.partyName,
      contract.projectId,
      contract.projectName,
      contract.amount,
      contract.currency,
      contract.signedOn,
      contract.startsOn,
      contract.endsOn,
      contract.createdBy,
    ],
  );
  return contractId;
}

export async function findContract(db: SqlExecutor, contractId: string): Promise<Contract | null> {
  const { rows } = await db.query<ContractRow>(
    `select ${contractColumns} from contracts where contract_id = $1`,
    [contractId],
  );
  return rows[0] ? toContract(rows[0]) : null;
}

export async function searchContracts(
  db: SqlExecutor,
  query: { text?: string | undefined; projectId?: string | undefined; limit: number },
): Promise<Contract[]> {
  const { rows } = await db.query<ContractRow>(
    `select ${contractColumns} from contracts
      where ($1::text is null or title ilike '%' || $1 || '%' or reference ilike '%' || $1 || '%'
             or coalesce(party_name, '') ilike '%' || $1 || '%')
        and ($2::text is null or project_id = $2)
      order by coalesce(signed_on, starts_on, created_at::date) desc, contract_id limit $3`,
    [query.text ?? null, query.projectId ?? null, query.limit],
  );
  return rows.map(toContract);
}

type ObligationRow = {
  obligation_id: string;
  contract_id: string;
  reference: string;
  label: string;
  owed_by: 'us' | 'them';
  due_on: string;
  clause: string;
  done_on: string | null;
};
const obligationSelect = `select o.obligation_id, o.contract_id, c.reference, o.label, o.owed_by,
    to_char(o.due_on, 'YYYY-MM-DD') as due_on, o.clause, to_char(o.done_on, 'YYYY-MM-DD') as done_on
  from obligations o join contracts c on c.contract_id = o.contract_id`;
const toObligation = (row: ObligationRow): Obligation => ({
  obligationId: row.obligation_id,
  contractId: row.contract_id,
  contractReference: row.reference,
  label: row.label,
  owedBy: row.owed_by,
  dueOn: row.due_on,
  clause: row.clause,
  doneOn: row.done_on,
});

export async function insertObligation(
  db: SqlExecutor,
  organizationId: string,
  obligation: { contractId: string; label: string; owedBy: 'us' | 'them'; dueOn: string; clause: string },
): Promise<string> {
  const obligationId = newId('obl');
  await db.query(
    `insert into obligations (obligation_id, organization_id, contract_id, label, owed_by, due_on, clause)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      obligationId,
      organizationId,
      obligation.contractId,
      obligation.label,
      obligation.owedBy,
      obligation.dueOn,
      obligation.clause,
    ],
  );
  return obligationId;
}

export async function findObligation(db: SqlExecutor, obligationId: string): Promise<Obligation | null> {
  const { rows } = await db.query<ObligationRow>(`${obligationSelect} where o.obligation_id = $1`, [
    obligationId,
  ]);
  return rows[0] ? toObligation(rows[0]) : null;
}

export async function completeObligation(
  db: SqlExecutor,
  obligationId: string,
  done: { on: string; by: string },
): Promise<void> {
  await db.query(
    `update obligations set done_on = $2, done_by = $3 where obligation_id = $1 and done_on is null`,
    [obligationId, done.on, done.by],
  );
}

/** What is still to do by a day — what we owe and what is owed to us — the soonest first. */
export async function obligationsDue(db: SqlExecutor, until: string): Promise<Obligation[]> {
  const { rows } = await db.query<ObligationRow>(
    `${obligationSelect} where o.done_on is null and o.due_on <= $1::date order by o.due_on, o.obligation_id`,
    [until],
  );
  return rows.map(toObligation);
}

type SecurityRow = {
  security_id: string;
  contract_id: string;
  reference: string;
  kind: SecurityKind;
  amount: string;
  currency: string;
  release_on: string | null;
  recovered_on: string | null;
  clause: string;
};
const securitySelect = `select s.security_id, s.contract_id, c.reference, s.kind, s.amount, c.currency,
    to_char(s.release_on, 'YYYY-MM-DD') as release_on, to_char(s.recovered_on, 'YYYY-MM-DD') as recovered_on,
    s.clause
  from securities s join contracts c on c.contract_id = s.contract_id`;
const toSecurity = (row: SecurityRow): Security => ({
  securityId: row.security_id,
  contractId: row.contract_id,
  contractReference: row.reference,
  kind: row.kind,
  amount: Number(row.amount),
  currency: row.currency,
  releaseOn: row.release_on,
  recoveredOn: row.recovered_on,
  clause: row.clause,
});

export async function insertSecurity(
  db: SqlExecutor,
  organizationId: string,
  security: { contractId: string; kind: SecurityKind; amount: number; releaseOn?: string | undefined; clause: string },
): Promise<string> {
  const securityId = newId('sec');
  await db.query(
    `insert into securities (security_id, organization_id, contract_id, kind, amount, release_on, clause)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      securityId,
      organizationId,
      security.contractId,
      security.kind,
      security.amount,
      security.releaseOn ?? null,
      security.clause,
    ],
  );
  return securityId;
}

export async function findSecurity(db: SqlExecutor, securityId: string): Promise<Security | null> {
  const { rows } = await db.query<SecurityRow>(`${securitySelect} where s.security_id = $1`, [securityId]);
  return rows[0] ? toSecurity(rows[0]) : null;
}

export async function recoverSecurity(db: SqlExecutor, securityId: string, on: string): Promise<void> {
  await db.query(
    `update securities set recovered_on = $2 where security_id = $1 and recovered_on is null`,
    [securityId, on],
  );
}

/** Retentions and bonds not recovered yet, the soonest release first. */
export async function securitiesHeld(db: SqlExecutor): Promise<Security[]> {
  const { rows } = await db.query<SecurityRow>(
    `${securitySelect} where s.recovered_on is null order by s.release_on nulls last, s.security_id`,
  );
  return rows.map(toSecurity);
}

type RuleRow = {
  rule_id: string;
  kind: RuleKind;
  posts: string[];
  amount: string | null;
  words: string[];
  clause: string;
};
const toRule = (row: RuleRow): SpendingRule => ({
  ruleId: row.rule_id,
  kind: row.kind,
  posts: row.posts,
  amount: row.amount === null ? null : Number(row.amount),
  words: row.words,
  clause: row.clause,
});

export async function insertRule(
  db: SqlExecutor,
  organizationId: string,
  rule: { contractId: string; kind: RuleKind; posts: string[]; amount?: number | undefined; words: string[]; clause: string },
): Promise<string> {
  const ruleId = newId('rul');
  await db.query(
    `insert into spending_rules (rule_id, organization_id, contract_id, kind, posts, amount, words, clause)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [ruleId, organizationId, rule.contractId, rule.kind, rule.posts, rule.amount ?? null, rule.words, rule.clause],
  );
  return ruleId;
}

async function rulesOf(db: SqlExecutor, contractId: string): Promise<SpendingRule[]> {
  const { rows } = await db.query<RuleRow>(
    `select rule_id, kind, posts, amount, words, clause from spending_rules
      where contract_id = $1 order by created_at, rule_id`,
    [contractId],
  );
  return rows.map(toRule);
}

export async function contractFile(db: SqlExecutor, contractId: string): Promise<ContractFile | null> {
  const contract = await findContract(db, contractId);
  if (!contract) return null;
  const obligations = await db.query<ObligationRow>(
    `${obligationSelect} where o.contract_id = $1 order by o.due_on, o.obligation_id`,
    [contractId],
  );
  const securities = await db.query<SecurityRow>(
    `${securitySelect} where s.contract_id = $1 order by s.release_on nulls last, s.security_id`,
    [contractId],
  );
  return {
    ...contract,
    obligations: obligations.rows.map(toObligation),
    securities: securities.rows.map(toSecurity),
    rules: await rulesOf(db, contractId),
  };
}

/** The funding agreements of a project, with their rules: what its expenses must respect. */
export async function agreementsOf(db: SqlExecutor, projectId: string): Promise<Agreement[]> {
  const { rows } = await db.query<ContractRow>(
    `select ${contractColumns} from contracts where kind = 'funding' and project_id = $1
      order by reference`,
    [projectId],
  );
  const agreements: Agreement[] = [];
  for (const row of rows) {
    agreements.push({
      contractId: row.contract_id,
      reference: row.reference,
      title: row.title,
      partyName: row.party_name,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      rules: await rulesOf(db, row.contract_id),
    });
  }
  return agreements;
}

/** One row per obligation: the `obligations` data set. */
export async function obligationRows(db: SqlExecutor, query: { from?: string; to?: string; limit: number }) {
  const { rows } = await db.query<ObligationRow>(
    `${obligationSelect}
      where ($1::date is null or o.due_on >= $1::date) and ($2::date is null or o.due_on <= $2::date)
      order by o.due_on limit $3`,
    [query.from ?? null, query.to ?? null, query.limit],
  );
  return rows.map((row) => ({
    dueOn: row.due_on,
    contract: row.reference,
    owedBy: row.owed_by,
    label: row.label,
    done: row.done_on ? 1 : 0,
  }));
}
