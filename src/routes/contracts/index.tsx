import { Button, DataTable, EmptyState, PageHeader, Tag } from '@kete/design';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { fetchCommitments } from '@/features/contracts/functions';
import { kindLabel } from '@/features/contracts/ui/labels';
import { shown } from '@/lib/money';
import { AppShell } from '@/lib/shell';
import { requirePerson } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

export const Route = createFileRoute('/engagements')({
  beforeLoad: ({ location }) => requirePerson(location.href),
  loader: () => fetchCommitments(),
  component: CommitmentsPage,
});

function CommitmentsPage() {
  const page = Route.useLoaderData();
  const navigate = useNavigate();
  return (
    <AppShell>
      <PageHeader
        title={m.contracts_title()}
        description={m.contracts_intro()}
        actions={
          page.manage && (
            <Button onClick={() => void navigate({ to: '/engagements/nouveau' })}>
              {m.contract_new()}
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-title font-semibold">{m.due_title()}</h2>
          <DataTable
            caption={m.due_title()}
            rows={page.due}
            rowKey={(one) => one.obligationId}
            rowHref={(one) => `/engagements/${one.contractId}`}
            empty={<EmptyState title={m.due_empty()} />}
            columns={[
              {
                key: 'due',
                label: m.obligation_due(),
                render: (one) =>
                  one.dueOn < page.today ? <Tag tone="error">{one.dueOn}</Tag> : one.dueOn,
              },
              { key: 'contract', label: m.contract_reference(), render: (one) => one.contractReference },
              { key: 'label', label: m.obligation_label(), render: (one) => one.label },
              {
                key: 'owed',
                label: m.obligation_owed_by(),
                render: (one) => (one.owedBy === 'us' ? m.owed_by_us() : m.owed_by_them()),
              },
            ]}
          />
        </section>

        {page.toRecover.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-heading text-title font-semibold">{m.recover_title()}</h2>
            <DataTable
              caption={m.recover_title()}
              rows={page.toRecover}
              rowKey={(one) => one.securityId}
              rowHref={(one) => `/engagements/${one.contractId}`}
              columns={[
                { key: 'contract', label: m.contract_reference(), render: (one) => one.contractReference },
                {
                  key: 'kind',
                  label: m.security_kind(),
                  render: (one) => (one.kind === 'retention' ? m.security_retention() : m.security_bond()),
                },
                { key: 'release', label: m.security_release(), render: (one) => one.releaseOn ?? '—' },
                {
                  key: 'amount',
                  label: m.security_amount(),
                  align: 'end',
                  render: (one) => shown(one.amount, one.currency),
                },
              ]}
            />
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-title font-semibold">{m.contracts_all()}</h2>
          <DataTable
            caption={m.contracts_all()}
            rows={page.contracts}
            rowKey={(one) => one.contractId}
            rowHref={(one) => `/engagements/${one.contractId}`}
            empty={<EmptyState title={m.contracts_empty()}>{m.contracts_empty_body()}</EmptyState>}
            columns={[
              { key: 'reference', label: m.contract_reference(), render: (one) => one.reference },
              { key: 'kind', label: m.contract_kind(), render: (one) => kindLabel(one.kind) },
              { key: 'title', label: m.contract_title(), render: (one) => one.title },
              { key: 'party', label: m.contract_party(), render: (one) => one.partyName ?? '—' },
              { key: 'project', label: m.contract_project(), render: (one) => one.projectName ?? '—' },
              {
                key: 'amount',
                label: m.contract_amount(),
                align: 'end',
                render: (one) => (one.amount === null ? '—' : shown(one.amount, one.currency)),
              },
            ]}
          />
        </section>
      </div>
    </AppShell>
  );
}
