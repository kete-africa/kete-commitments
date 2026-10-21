import {
  Button,
  DataTable,
  EmptyState,
  ErrorNote,
  Facts,
  PageHeader,
  Panel,
  SelectField,
  Tag,
  TextAreaField,
  TextField,
} from '@kete/design';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { ruleKinds, securityKinds, type RuleKind, type SecurityKind } from '@/features/contracts/domain/kinds';
import {
  addObligation,
  addRule,
  addSecurity,
  fetchContract,
  meetObligation,
  recoverSecurity,
} from '@/features/contracts/functions';
import { kindLabel, ruleLabel } from '@/features/contracts/ui/labels';
import { sayError } from '@/lib/errors';
import { shown, typed } from '@/lib/money';
import { AppShell } from '@/lib/shell';
import { requirePerson } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

export const Route = createFileRoute('/engagements/$contractId')({
  beforeLoad: ({ location }) => requirePerson(location.href),
  loader: ({ params }) => fetchContract({ data: { contractId: params.contractId } }),
  component: ContractPage,
});

const list = (text: string) =>
  text
    .split(',')
    .map((one) => one.trim())
    .filter(Boolean);

function ContractPage() {
  const { contract, manage, today, threadHref } = Route.useLoaderData();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [obligation, setObligation] = useState({ label: '', owedBy: 'us' as 'us' | 'them', dueOn: today, clause: '' });
  const [security, setSecurity] = useState({ kind: 'retention' as SecurityKind, amount: '', releaseOn: '', clause: '' });
  const [rule, setRule] = useState({ kind: 'eligible_posts' as RuleKind, values: '', amount: '', clause: '' });

  if (!contract) {
    return (
      <AppShell>
        <EmptyState title={m.contract_not_found()} />
      </AppShell>
    );
  }
  const run = (
    work: () => Promise<{ ok: true } | { ok: false; code: string; facts?: Record<string, string | number> }>,
    then?: () => void,
  ) => {
    setBusy(true);
    setError(null);
    void work()
      .then(async (outcome) => {
        if (!outcome.ok) return setError(sayError(outcome.code, outcome.facts));
        then?.();
        await router.invalidate();
      })
      .finally(() => setBusy(false));
  };
  const held = typed(security.amount, contract.currency);
  const ceiling = typed(rule.amount, contract.currency);

  return (
    <AppShell>
      <PageHeader
        breadcrumbLabel={m.breadcrumb_label()}
        breadcrumbs={[{ label: m.contracts_title(), href: '/engagements' }, { label: contract.reference }]}
        title={`${contract.reference} — ${contract.title}`}
        status={<Tag tone="neutral">{kindLabel(contract.kind)}</Tag>}
        description={contract.partyName ?? undefined}
        {...(threadHref
          ? {
              actions: (
                <a
                  href={threadHref}
                  className="inline-flex h-(--control-height) items-center rounded-control border border-line-control px-3 text-body-sm font-semibold"
                >
                  {m.contract_thread()}
                </a>
              ),
            }
          : {})}
      />
      <div className="flex flex-col gap-6">
        <ErrorNote>{error}</ErrorNote>
        <Panel>
          <Facts
            items={[
              { label: m.contract_project(), value: contract.projectName ?? '—' },
              {
                label: m.contract_amount(),
                value: contract.amount === null ? '—' : shown(contract.amount, contract.currency),
              },
              { label: m.contract_signed_on(), value: contract.signedOn ?? '—' },
              { label: m.contract_starts_on(), value: contract.startsOn ?? '—' },
              { label: m.contract_ends_on(), value: contract.endsOn ?? '—' },
            ]}
          />
        </Panel>

        {contract.kind === 'funding' && (
          <Panel title={m.rules_title()}>
            <div className="flex flex-col gap-4">
              <p className="text-fg-muted">{m.rules_intro()}</p>
              <DataTable
                caption={m.rules_title()}
                rows={contract.rules}
                rowKey={(one) => one.ruleId}
                empty={<p className="text-fg-muted">{m.rules_none()}</p>}
                columns={[
                  { key: 'kind', label: m.rule_kind(), render: (one) => ruleLabel(one.kind) },
                  {
                    key: 'what',
                    label: m.rule_what(),
                    render: (one) =>
                      one.kind === 'eligible_posts'
                        ? one.posts.join(', ')
                        : one.kind === 'excluded_words'
                          ? one.words.join(', ')
                          : one.kind === 'single_ceiling' && one.amount !== null
                            ? shown(one.amount, contract.currency)
                            : `${contract.startsOn ?? '…'} → ${contract.endsOn ?? '…'}`,
                  },
                  { key: 'clause', label: m.clause(), render: (one) => `« ${one.clause} »` },
                ]}
              />
              {manage && (
                <form
                  className="grid items-end gap-3 sm:grid-cols-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    run(
                      () =>
                        addRule({
                          data: {
                            contractId: contract.contractId,
                            kind: rule.kind,
                            posts: rule.kind === 'eligible_posts' ? list(rule.values) : [],
                            words: rule.kind === 'excluded_words' ? list(rule.values) : [],
                            ...(rule.kind === 'single_ceiling' && ceiling !== null ? { amount: ceiling } : {}),
                            clause: rule.clause.trim(),
                          },
                        }),
                      () => setRule({ ...rule, values: '', amount: '', clause: '' }),
                    );
                  }}
                >
                  <SelectField
                    label={m.rule_kind()}
                    value={rule.kind}
                    options={ruleKinds.map((one) => ({ value: one, label: ruleLabel(one) }))}
                    onChange={(event) => setRule({ ...rule, kind: event.target.value as RuleKind })}
                  />
                  {rule.kind === 'single_ceiling' ? (
                    <TextField
                      label={m.rule_ceiling()}
                      value={rule.amount}
                      inputMode="decimal"
                      onChange={(event) => setRule({ ...rule, amount: event.target.value })}
                    />
                  ) : rule.kind === 'period' ? (
                    <p className="text-body-sm text-fg-muted">{m.rule_period_hint()}</p>
                  ) : (
                    <TextField
                      label={rule.kind === 'eligible_posts' ? m.rule_posts() : m.rule_words()}
                      hint={m.rule_list_hint()}
                      value={rule.values}
                      onChange={(event) => setRule({ ...rule, values: event.target.value })}
                    />
                  )}
                  <TextAreaField
                    label={m.clause()}
                    hint={m.clause_hint()}
                    value={rule.clause}
                    rows={2}
                    maxLength={2000}
                    onChange={(clause) => setRule({ ...rule, clause })}
                  />
                  <Button type="submit" disabled={busy || !rule.clause.trim()}>
                    {m.rule_add()}
                  </Button>
                </form>
              )}
            </div>
          </Panel>
        )}

        <Panel title={m.obligations_title()}>
          <div className="flex flex-col gap-4">
            <DataTable
              caption={m.obligations_title()}
              rows={contract.obligations}
              rowKey={(one) => one.obligationId}
              empty={<p className="text-fg-muted">{m.obligations_none()}</p>}
              columns={[
                {
                  key: 'due',
                  label: m.obligation_due(),
                  render: (one) =>
                    !one.doneOn && one.dueOn < today ? <Tag tone="error">{one.dueOn}</Tag> : one.dueOn,
                },
                { key: 'label', label: m.obligation_label(), render: (one) => one.label },
                {
                  key: 'owed',
                  label: m.obligation_owed_by(),
                  render: (one) => (one.owedBy === 'us' ? m.owed_by_us() : m.owed_by_them()),
                },
                { key: 'clause', label: m.clause(), render: (one) => `« ${one.clause} »` },
                {
                  key: 'state',
                  label: m.state(),
                  render: (one) =>
                    one.doneOn ? (
                      <Tag tone="validated">{m.obligation_done({ day: one.doneOn })}</Tag>
                    ) : manage ? (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => run(() => meetObligation({ data: { obligationId: one.obligationId } }))}
                      >
                        {m.obligation_meet()}
                      </Button>
                    ) : (
                      <Tag tone="verify">{m.obligation_open()}</Tag>
                    ),
                },
              ]}
            />
            {manage && (
              <form
                className="grid items-end gap-3 sm:grid-cols-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(
                    () =>
                      addObligation({
                        data: {
                          contractId: contract.contractId,
                          label: obligation.label.trim(),
                          owedBy: obligation.owedBy,
                          dueOn: obligation.dueOn,
                          clause: obligation.clause.trim(),
                        },
                      }),
                    () => setObligation({ ...obligation, label: '', clause: '' }),
                  );
                }}
              >
                <TextField
                  label={m.obligation_label()}
                  value={obligation.label}
                  required
                  maxLength={300}
                  onChange={(event) => setObligation({ ...obligation, label: event.target.value })}
                />
                <SelectField
                  label={m.obligation_owed_by()}
                  value={obligation.owedBy}
                  options={[
                    { value: 'us', label: m.owed_by_us() },
                    { value: 'them', label: m.owed_by_them() },
                  ]}
                  onChange={(event) =>
                    setObligation({ ...obligation, owedBy: event.target.value as 'us' | 'them' })
                  }
                />
                <TextField
                  label={m.obligation_due()}
                  type="date"
                  value={obligation.dueOn}
                  required
                  onChange={(event) => setObligation({ ...obligation, dueOn: event.target.value })}
                />
                <TextAreaField
                  label={m.clause()}
                  hint={m.clause_hint()}
                  value={obligation.clause}
                  rows={2}
                  maxLength={2000}
                  onChange={(clause) => setObligation({ ...obligation, clause })}
                />
                <Button
                  type="submit"
                  disabled={busy || !obligation.label.trim() || !obligation.clause.trim()}
                >
                  {m.obligation_add()}
                </Button>
              </form>
            )}
          </div>
        </Panel>

        <Panel title={m.securities_title()}>
          <div className="flex flex-col gap-4">
            <DataTable
              caption={m.securities_title()}
              rows={contract.securities}
              rowKey={(one) => one.securityId}
              empty={<p className="text-fg-muted">{m.securities_none()}</p>}
              columns={[
                {
                  key: 'kind',
                  label: m.security_kind(),
                  render: (one) => (one.kind === 'retention' ? m.security_retention() : m.security_bond()),
                },
                {
                  key: 'amount',
                  label: m.security_amount(),
                  align: 'end',
                  render: (one) => shown(one.amount, one.currency),
                },
                { key: 'release', label: m.security_release(), render: (one) => one.releaseOn ?? '—' },
                { key: 'clause', label: m.clause(), render: (one) => `« ${one.clause} »` },
                {
                  key: 'state',
                  label: m.state(),
                  render: (one) =>
                    one.recoveredOn ? (
                      <Tag tone="validated">{m.security_recovered({ day: one.recoveredOn })}</Tag>
                    ) : manage ? (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            recoverSecurity({ data: { securityId: one.securityId, recoveredOn: today } }),
                          )
                        }
                      >
                        {m.security_recover()}
                      </Button>
                    ) : (
                      <Tag tone="verify">{m.security_held()}</Tag>
                    ),
                },
              ]}
            />
            {manage && (
              <form
                className="grid items-end gap-3 sm:grid-cols-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!held) return;
                  run(
                    () =>
                      addSecurity({
                        data: {
                          contractId: contract.contractId,
                          kind: security.kind,
                          amount: held,
                          ...(security.releaseOn ? { releaseOn: security.releaseOn } : {}),
                          clause: security.clause.trim(),
                        },
                      }),
                    () => setSecurity({ ...security, amount: '', clause: '' }),
                  );
                }}
              >
                <SelectField
                  label={m.security_kind()}
                  value={security.kind}
                  options={securityKinds.map((one) => ({
                    value: one,
                    label: one === 'retention' ? m.security_retention() : m.security_bond(),
                  }))}
                  onChange={(event) => setSecurity({ ...security, kind: event.target.value as SecurityKind })}
                />
                <TextField
                  label={m.security_amount()}
                  value={security.amount}
                  inputMode="decimal"
                  required
                  onChange={(event) => setSecurity({ ...security, amount: event.target.value })}
                />
                <TextField
                  label={m.security_release()}
                  type="date"
                  value={security.releaseOn}
                  onChange={(event) => setSecurity({ ...security, releaseOn: event.target.value })}
                />
                <TextAreaField
                  label={m.clause()}
                  value={security.clause}
                  rows={2}
                  maxLength={2000}
                  onChange={(clause) => setSecurity({ ...security, clause })}
                />
                <Button type="submit" disabled={busy || !held || !security.clause.trim()}>
                  {m.security_add()}
                </Button>
              </form>
            )}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
