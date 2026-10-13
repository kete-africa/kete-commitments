import { readFileSync } from 'node:fs';
import type { KeteIdentity } from '@kete/auth';
import { assignBusinessRole, createHttpApi, performGesture, type Caller } from '@kete/capabilities';
import { validateManifest } from '@kete/sdk';
import { assertOrganizationIsolation, createTestSchema, type TestSchema } from '@kete/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { migrations } from '../db/migrations';
import { checkSpending, folded, toRecover } from '../src/features/contracts/domain/contracts';
import { transaction, usePool } from '../src/platform/db';
import { manifest } from '../src/platform/events';
import { datasets, registry } from '../src/platform/registry';
import { asPerson } from '../src/platform/rights';
import { screenActor } from '../src/platform/session';

// Spec 001 — Kete Commitments. The proof of step I1, on its side: « A funder's clause refuses a
// purchase » — an app asks whether a project's funders allow an expense, and the answer cites the
// passage. Kete Finance's side asks it before it commits money (its spec 004).

const ORG = 'org_acme';
const PROJECT = 'prj_0000000000000000000000000000000a';
let db: TestSchema;

const person = (userId: string, role: KeteIdentity['role'], name: string) =>
  ({
    userId,
    email: `${userId}@example.test`,
    name,
    organizationId: ORG,
    role,
    apps: {},
    twoFactor: false,
    expiresAt: new Date(Date.now() + 60_000),
  }) satisfies KeteIdentity;

const lawson = person('usr_lawson', 'member', 'Mme Lawson'); // keeps the contracts
const kofi = person('usr_kofi', 'member', 'Kofi'); // spends on the project
const edem = person('usr_edem', 'member', 'Edem'); // no role here

const onScreen = (identity: KeteIdentity): Caller => ({ actor: screenActor(identity), organizationId: ORG });

async function gesture<T = Record<string, unknown>>(who: KeteIdentity, name: string, input: unknown) {
  return performGesture<T>(registry, { ...onScreen(who), name, input }, (work) =>
    asPerson(who, work, `${who.userId}-token`),
  );
}
const done = <T>(outcome: { ok: true; output: T } | { ok: false; code: string }): T => {
  if (!outcome.ok) throw new Error(`refused: ${outcome.code}`);
  return outcome.output;
};

const today = new Date().toISOString().slice(0, 10);
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const ids = {} as Record<'grant' | 'clinic', string>;

// The center: the project is visible to who keeps the contracts.
function fakeCenter(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const path = String(input instanceof Request ? input.url : input).replace('https://api.center.test', '');
  const token = new Headers(init?.headers).get('authorization') ?? '';
  if (path === `/v1/projects/${PROJECT}` && token.includes('usr_lawson')) {
    return Promise.resolve(
      Response.json({
        project: {
          projectId: PROJECT,
          name: 'Centrale solaire — Clinique Biasa',
          party: null,
          lead: { userId: 'usr_ama', name: 'Ama' },
          status: 'open',
          phase: null,
          sold: null,
          currency: 'XOF',
          team: [],
          posts: [],
          budget: 0,
        },
      }),
    );
  }
  return Promise.resolve(Response.json({ error: 'not_found' }, { status: 404 }));
}

beforeAll(async () => {
  process.env.ENTERPRISE_API_URL = 'https://api.center.test';
  vi.stubGlobal('fetch', fakeCenter);
  db = await createTestSchema({
    migrate: async (owner, context) => {
      for (const migration of migrations) await owner.query(migration.sql(context));
    },
  });
  usePool(db.app);
  await transaction(ORG, async (client) => {
    await assignBusinessRole(client, ORG, lawson.userId, 'manager');
    await assignBusinessRole(client, ORG, kofi.userId, 'staff');
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  delete process.env.ENTERPRISE_API_URL;
  await db.drop();
});

describe('a funder’s rules, read', () => {
  const agreement = {
    contractId: 'ctr_1',
    reference: 'CONV-07',
    title: 'Convention',
    partyName: 'Fonds',
    startsOn: '2026-08-01',
    endsOn: '2027-01-31',
    rules: [
      { ruleId: 'r1', kind: 'eligible_posts' as const, posts: ['Matériel', 'Main-d’œuvre'], amount: null, words: [], clause: 'Art. 5.1' },
      { ruleId: 'r2', kind: 'single_ceiling' as const, posts: [], amount: 1_500_000, words: [], clause: 'Art. 5.3' },
      { ruleId: 'r3', kind: 'excluded_words' as const, posts: [], amount: null, words: ['véhicule'], clause: 'Art. 5.4' },
      { ruleId: 'r4', kind: 'period' as const, posts: [], amount: null, words: [], clause: 'Art. 3' },
    ],
  };
  const spend: { post: string | null; amount: number; label: string; on: string } = {
    post: 'matériel',
    amount: 120_000,
    label: 'Câbles solaires',
    on: '2026-10-13',
  };
  it('allows what every rule allows, posts written either way', () => {
    expect(checkSpending([agreement], spend)).toEqual({ allowed: true, refusals: [], agreements: ['CONV-07'] });
    expect(folded(' Main-d’Œuvre ')).toBe('main-d’œuvre');
  });
  it('refuses what one rule refuses, and cites its passage', () => {
    const refused = (change: Partial<typeof spend>) =>
      checkSpending([agreement], { ...spend, ...change }).refusals.map((r) => [r.kind, r.clause]);
    expect(refused({ post: 'Transport' })).toEqual([['eligible_posts', 'Art. 5.1']]);
    expect(refused({ post: null })).toEqual([['eligible_posts', 'Art. 5.1']]);
    expect(refused({ amount: 1_500_001 })).toEqual([['single_ceiling', 'Art. 5.3']]);
    expect(refused({ label: 'Location de VEHICULE 4x4' })).toEqual([['excluded_words', 'Art. 5.4']]);
    expect(refused({ on: '2027-02-01' })).toEqual([['period', 'Art. 3']]);
    // No agreement: nothing restricts the project.
    expect(checkSpending([], spend)).toEqual({ allowed: true, refusals: [], agreements: [] });
  });
  it('says when a retention is to be recovered', () => {
    expect(toRecover({ releaseOn: '2026-10-01', recoveredOn: null }, '2026-10-13')).toBe(true);
    expect(toRecover({ releaseOn: '2026-11-01', recoveredOn: null }, '2026-10-13')).toBe(false);
    expect(toRecover({ releaseOn: '2026-10-01', recoveredOn: '2026-10-05' }, '2026-10-13')).toBe(false);
  });
});

describe('a funder’s clause refuses a purchase', () => {
  it('is written with the agreement, on the project the center shows', async () => {
    ids.grant = done(
      await gesture<{ contractId: string }>(lawson, 'contracts_write', {
        kind: 'funding',
        reference: 'CONV-FONDS-ER-2026-07',
        title: 'Convention de financement',
        partyName: 'Fonds Énergie Rurale',
        projectId: PROJECT,
        amount: 3_000_000,
        startsOn: day(-60),
        endsOn: day(120),
      }),
    ).contractId;
    // Kofi spends, he does not write contracts.
    expect(
      await gesture(kofi, 'contracts_write', { kind: 'client', reference: 'X', title: 'X' }),
    ).toMatchObject({ ok: false, code: 'not_allowed' });
    for (const rule of [
      { kind: 'eligible_posts', posts: ['Matériel', 'Main-d’œuvre'], clause: 'Art. 5.1 — Les fonds financent exclusivement le matériel et la main-d’œuvre.' },
      { kind: 'single_ceiling', amount: 1_500_000, clause: 'Art. 5.3 — Toute dépense unitaire supérieure à 1 500 000 F CFA requiert l’avis préalable du Fonds.' },
      { kind: 'excluded_words', words: ['véhicule', 'carburant'], clause: 'Art. 5.4 — Sont exclus les véhicules et le carburant.' },
      { kind: 'period', clause: 'Art. 3 — Seules les dépenses engagées pendant la convention sont éligibles.' },
    ]) {
      done(await gesture(lawson, 'rules_add', { contractId: ids.grant, ...rule }));
    }
    // A rule without what it says is refused; a client's contract has no rules.
    expect(
      await gesture(lawson, 'rules_add', { contractId: ids.grant, kind: 'eligible_posts', posts: [], clause: 'x' }),
    ).toMatchObject({ ok: false, code: 'rule_incomplete' });
    ids.clinic = done(
      await gesture<{ contractId: string }>(lawson, 'contracts_write', {
        kind: 'client',
        reference: 'MAR-2026-014',
        title: 'Centrale solaire',
        projectId: PROJECT,
      }),
    ).contractId;
    expect(
      await gesture(lawson, 'rules_add', { contractId: ids.clinic, kind: 'single_ceiling', amount: 1, clause: 'x' }),
    ).toMatchObject({ ok: false, code: 'not_a_funding' });
    // A project the center does not show her is refused.
    expect(
      await gesture(lawson, 'contracts_write', {
        kind: 'funding',
        reference: 'Y',
        title: 'Y',
        projectId: 'prj_000000000000000000000000000000ff',
      }),
    ).toMatchObject({ ok: false, code: 'not_of_project' });
  });

  it('answers an app over its API, for the person: a vehicle is refused, with the passage', async () => {
    const ask = async (who: KeteIdentity, spend: Record<string, unknown>) => {
      return asPerson(who, () =>
        registry.invoke({
          actor: { kind: 'app', id: 'app_api', channel: 'api', onBehalfOf: { kind: 'person', id: who.userId } },
          organizationId: ORG,
          name: 'spending_check',
          input: { projectId: PROJECT, on: today, ...spend },
        }),
      );
    };
    expect(await ask(kofi, { post: 'Matériel', amount: 120_000, label: 'Câbles solaires' })).toMatchObject({
      status: 'done',
      output: { allowed: true, agreements: ['CONV-FONDS-ER-2026-07'] },
    });
    expect(await ask(kofi, { post: 'Transport', amount: 450_000, label: 'Location de véhicule 4x4' })).toMatchObject({
      status: 'done',
      output: {
        allowed: false,
        refusals: [
          { kind: 'eligible_posts', clause: expect.stringMatching(/^Art\. 5\.1/), agreement: 'CONV-FONDS-ER-2026-07' },
          { kind: 'excluded_words', clause: expect.stringMatching(/^Art\. 5\.4/), detail: 'véhicule' },
        ],
      },
    });
    // Who has no role here may not ask.
    expect(await ask(edem, { post: 'Matériel', amount: 1, label: 'x' })).toMatchObject({
      status: 'refused',
      reason: 'not_allowed',
    });
  });

  it('is reached at /api/v1/capabilities/spending_check, as any app reaches it', async () => {
    const api = createHttpApi({
      registry,
      datasets,
      prefix: '/api/v1',
      caller: async () => ({
        organizationId: ORG,
        actor: { kind: 'app', id: 'app_api', channel: 'api', onBehalfOf: { kind: 'person', id: kofi.userId } },
      }),
    });
    const response = await asPerson(kofi, () =>
      api(
        new Request('https://commitments.test/api/v1/capabilities/spending_check', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId: PROJECT, post: 'Matériel', amount: 2_000_000, label: 'Onduleur', on: today }),
        }),
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'done',
      output: { allowed: false, refusals: [{ kind: 'single_ceiling', detail: '1500000' }] },
    });
  });
});

describe('obligations, retentions and bonds', () => {
  it('lists what is due, and what is to be recovered', async () => {
    done(
      await gesture(lawson, 'obligations_add', {
        contractId: ids.clinic,
        label: 'Paiement du deuxième acompte',
        owedBy: 'them',
        dueOn: day(-3),
        clause: 'Art. 9.2',
      }),
    );
    const later = done(
      await gesture<{ obligationId: string }>(lawson, 'obligations_add', {
        contractId: ids.clinic,
        label: 'Mise en service',
        owedBy: 'us',
        dueOn: day(12),
        clause: 'Art. 6',
      }),
    );
    done(
      await gesture(lawson, 'obligations_add', {
        contractId: ids.grant,
        label: 'Rapport final',
        owedBy: 'us',
        dueOn: day(100),
        clause: 'Art. 8',
      }),
    );
    const due = done(await gesture<{ label: string }[]>(lawson, 'obligations_due', {}));
    expect(due.map((one) => one.label)).toEqual(['Paiement du deuxième acompte', 'Mise en service']);
    done(await gesture(lawson, 'obligations_meet', later));
    expect(await gesture(lawson, 'obligations_meet', later)).toMatchObject({ ok: false, code: 'already_done' });

    const bond = done(
      await gesture<{ securityId: string }>(lawson, 'securities_add', {
        contractId: ids.clinic,
        kind: 'bond',
        amount: 500_000,
        releaseOn: day(-10),
        clause: 'Art. 4',
      }),
    );
    done(
      await gesture(lawson, 'securities_add', {
        contractId: ids.clinic,
        kind: 'retention',
        amount: 231_870,
        releaseOn: day(330),
        clause: 'Art. 10',
      }),
    );
    expect(done(await gesture<{ amount: number }[]>(lawson, 'securities_to_recover', {}))).toEqual([
      expect.objectContaining({ amount: 500_000, kind: 'bond' }),
    ]);
    done(await gesture(lawson, 'securities_recover', { ...bond, recoveredOn: today }));
    expect(done(await gesture<unknown[]>(lawson, 'securities_to_recover', {}))).toEqual([]);
    const rows = await asPerson(lawson, () => datasets.read(onScreen(lawson), 'obligations', {}));
    expect(rows).toMatchObject({ status: 'done', dataset: 'obligations' });
  });

  it('keeps each organization’s contracts to itself (RLS)', async () => {
    await assertOrganizationIsolation({
      app: db.app,
      table: 'contracts',
      organizations: ['org_x', 'org_y'],
      insert: async (client, organizationId) => {
        await client.query(
          `insert into contracts (contract_id, organization_id, kind, reference, title, currency, created_by)
           values ($1, $2, 'client', 'R', 'x', 'XOF', 'usr_x')`,
          [`ctr_${organizationId}`, organizationId],
        );
      },
    });
  });
});

describe('what the app says about itself', () => {
  it('serves a valid manifest, with the check other apps call', () => {
    const card = manifest();
    expect(validateManifest(card).ok).toBe(true);
    expect(card).toMatchObject({ product: 'prd_kete_commitments', name: 'Kete Commitments' });
    expect(card.capabilities?.map((c) => c.name)).toEqual(
      expect.arrayContaining(['spending_check', 'obligations_due', 'contracts_write', 'rules_add']),
    );
    expect(card.emits?.map((e) => e.type)).toEqual(['contract.written']);
  });
  it('says the same words in every language', () => {
    const fr = JSON.parse(readFileSync(new URL('../messages/fr.json', import.meta.url), 'utf8'));
    const en = JSON.parse(readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8'));
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });
});
