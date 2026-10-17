import { Button, ErrorNote, PageHeader, Panel, SelectField, TextField } from '@kete/design';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { fetchContractForm, writeContract } from '@/features/contracts/functions';
import { contractKinds, type ContractKind } from '@/features/contracts/domain/kinds';
import { kindLabel } from '@/features/contracts/ui/labels';
import { sayError } from '@/lib/errors';
import { typed } from '@/lib/money';
import { AppShell } from '@/lib/shell';
import { requirePerson } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

export const Route = createFileRoute('/engagements/nouveau')({
  beforeLoad: ({ location }) => requirePerson(location.href),
  loader: () => fetchContractForm(),
  component: NewContractPage,
});

const CURRENCY = 'XOF';

function NewContractPage() {
  const form = Route.useLoaderData();
  const navigate = useNavigate();
  const [kind, setKind] = useState<ContractKind>('client');
  const [reference, setReference] = useState('');
  const [title, setTitle] = useState('');
  const [partyId, setPartyId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [amount, setAmount] = useState('');
  const [signedOn, setSignedOn] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = amount.trim() ? typed(amount, CURRENCY) : undefined;
  const party = form.parties.find((one) => one.partyId === partyId);
  const ready = reference.trim() !== '' && title.trim() !== '' && value !== null;

  return (
    <AppShell>
      <PageHeader
        breadcrumbLabel={m.breadcrumb_label()}
        breadcrumbs={[{ label: m.contracts_title(), href: '/engagements' }, { label: m.contract_new() }]}
        title={m.contract_new()}
        description={m.contract_new_intro()}
      />
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          setBusy(true);
          setError(null);
          void writeContract({
            data: {
              kind,
              reference: reference.trim(),
              title: title.trim(),
              ...(party ? { partyId: party.partyId, partyName: party.name } : {}),
              ...(!party && partyName.trim() ? { partyName: partyName.trim() } : {}),
              ...(projectId ? { projectId } : {}),
              ...(value !== undefined && value !== null ? { amount: value } : {}),
              ...(signedOn ? { signedOn } : {}),
              ...(startsOn ? { startsOn } : {}),
              ...(endsOn ? { endsOn } : {}),
            },
          })
            .then(async (outcome) => {
              if (!outcome.ok) return setError(sayError(outcome.code, outcome.facts));
              await navigate({
                to: '/engagements/$contractId',
                params: { contractId: outcome.output.contractId },
              });
            })
            .finally(() => setBusy(false));
        }}
      >
        <Panel>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={m.contract_kind()}
              value={kind}
              options={contractKinds.map((one) => ({ value: one, label: kindLabel(one) }))}
              onChange={(event) => setKind(event.target.value as ContractKind)}
            />
            <TextField
              label={m.contract_reference()}
              hint={m.contract_reference_hint()}
              value={reference}
              required
              maxLength={80}
              onChange={(event) => setReference(event.target.value)}
            />
            <TextField
              className="sm:col-span-2"
              label={m.contract_title()}
              value={title}
              required
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
            />
            {form.parties.length > 0 ? (
              <SelectField
                label={m.contract_party()}
                value={partyId}
                options={[
                  { value: '', label: m.party_choose() },
                  ...form.parties.map((one) => ({ value: one.partyId, label: one.name })),
                ]}
                onChange={(event) => setPartyId(event.target.value)}
              />
            ) : (
              <TextField
                label={m.contract_party()}
                hint={m.party_alone_hint()}
                value={partyName}
                maxLength={200}
                onChange={(event) => setPartyName(event.target.value)}
              />
            )}
            <SelectField
              label={m.contract_project()}
              hint={form.connected ? m.contract_project_hint() : m.contract_project_alone()}
              value={projectId}
              options={[
                { value: '', label: m.project_none() },
                ...form.projects.map((one) => ({ value: one.projectId, label: one.name })),
              ]}
              onChange={(event) => setProjectId(event.target.value)}
            />
            <TextField
              label={m.contract_amount()}
              value={amount}
              inputMode="decimal"
              {...(value === null ? { error: m.errors_invalid_input() } : {})}
              onChange={(event) => setAmount(event.target.value)}
            />
            <TextField
              label={m.contract_signed_on()}
              type="date"
              value={signedOn}
              onChange={(event) => setSignedOn(event.target.value)}
            />
            <TextField
              label={m.contract_starts_on()}
              type="date"
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
            />
            <TextField
              label={m.contract_ends_on()}
              type="date"
              value={endsOn}
              onChange={(event) => setEndsOn(event.target.value)}
            />
          </div>
        </Panel>
        <ErrorNote>{error}</ErrorNote>
        <div>
          <Button type="submit" disabled={busy || !ready}>
            {m.contract_write()}
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
