import type { AppHolding } from '@kete/center';
import type { SqlExecutor } from '@kete/tenancy';
import * as m from '@/paraglide/messages.js';
import { linkOf } from '@/platform/links';

// What contracts hold, as the center keeps it (kete-core spec 114), held by who wrote the
// contract: what we owe, due on its day; what the other party owes, waiting on it; a retention or
// a bond to recover, due on the day it may be claimed back.

export async function contractHoldings(db: SqlExecutor): Promise<AppHolding[]> {
  const { rows: obligations } = await db.query<{
    obligation_id: string;
    label: string;
    owed_by: 'us' | 'them';
    due_on: string;
    created_at: Date;
    contract_id: string;
    reference: string;
    party_id: string | null;
    party_name: string | null;
    project_id: string | null;
    created_by: string;
  }>(
    `select o.obligation_id, o.label, o.owed_by, to_char(o.due_on, 'YYYY-MM-DD') as due_on,
            o.created_at, c.contract_id, c.reference, c.party_id, c.party_name, c.project_id,
            c.created_by
       from obligations o join contracts c on c.contract_id = o.contract_id
      where o.done_on is null order by o.due_on limit 500`,
  );
  const { rows: securities } = await db.query<{
    security_id: string;
    release_on: string;
    created_at: Date;
    contract_id: string;
    reference: string;
    project_id: string | null;
    created_by: string;
  }>(
    `select s.security_id, to_char(s.release_on, 'YYYY-MM-DD') as release_on, s.created_at,
            c.contract_id, c.reference, c.project_id, c.created_by
       from securities s join contracts c on c.contract_id = s.contract_id
      where s.recovered_on is null and s.release_on is not null
      order by s.release_on limit 500`,
  );
  const objectOf = (r: { project_id: string | null; contract_id: string }) =>
    r.project_id
      ? { kind: 'project', id: r.project_id }
      : { kind: 'contract', id: r.contract_id };
  return [
    ...obligations.map((o): AppHolding => {
      const theirs = o.owed_by === 'them';
      return {
        kind: 'obligation',
        ref: o.obligation_id,
        object: objectOf(o),
        what: theirs
          ? m.holding_obligation_theirs({
              label: o.label,
              reference: o.reference,
              party: o.party_name ?? '—',
            })
          : m.holding_obligation_ours({ label: o.label, reference: o.reference }),
        holder: { kind: 'person', id: o.created_by },
        ...(theirs && o.party_id
          ? { state: 'waiting', waitingOn: { kind: 'party', id: o.party_id } }
          : { state: 'held' }),
        since: o.created_at.toISOString(),
        due: o.due_on,
        ...linkOf(`/engagements/${o.contract_id}`),
      };
    }),
    ...securities.map(
      (s): AppHolding => ({
        kind: 'security',
        ref: s.security_id,
        object: objectOf(s),
        what: m.holding_security_release({ reference: s.reference }),
        holder: { kind: 'person', id: s.created_by },
        state: 'held',
        since: s.created_at.toISOString(),
        due: s.release_on,
        ...linkOf(`/engagements/${s.contract_id}`),
      }),
    ),
  ];
}
