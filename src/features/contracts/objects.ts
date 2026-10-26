import type { AppObject } from '@kete/center';
import type { SqlExecutor } from '@kete/tenancy';
import * as m from '@/paraglide/messages.js';
import { linkOf } from '@/platform/links';

// Contracts in the center's index (spec 006; kete-core spec 142; doctrine D-062, R1, R15): each
// contract — with a client, a supplier, a funder — said with its project, its third party, who
// wrote it and whether it is unsigned, running or ended, so that « # », the search, Kete and the
// agents of the center find it with each person's own rights. Its data stays here.

/** The contracts not ended, and those that ended in the last month. */
export async function contractObjects(db: SqlExecutor): Promise<AppObject[]> {
  const { rows } = await db.query<{
    contract_id: string;
    reference: string;
    title: string;
    party_id: string | null;
    project_id: string | null;
    state: string;
    created_by: string;
    created_at: Date;
  }>(
    `select contract_id, reference, title, party_id, project_id, created_by, created_at,
            case when ends_on is not null and ends_on < current_date then 'ended'
                 when signed_on is null then 'unsigned'
                 else 'running' end as state
       from contracts
      where ends_on is null or ends_on >= current_date - 30
      order by created_at desc limit 500`,
  );
  return rows.map((r): AppObject => ({
    kind: 'contract',
    id: r.contract_id,
    title: m.object_contract({ reference: r.reference, title: r.title }),
    state: r.state,
    ...(r.project_id ? { projectId: r.project_id } : {}),
    ...(r.party_id ? { partyId: r.party_id } : {}),
    personId: r.created_by,
    ...linkOf(`/engagements/${r.contract_id}`),
    updatedAt: r.created_at.toISOString(),
  }));
}
