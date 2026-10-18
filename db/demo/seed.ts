import type { KeteIdentity } from '@kete/auth';
import { assignBusinessRole } from '@kete/capabilities';
import { transaction } from '@/platform/db';
import { registry } from '@/platform/registry';
import { asPerson } from '@/platform/rights';
import { screenActor } from '@/platform/session';

// The demonstration's data: the contracts of a small solar installer — a client's, a supplier's,
// and a funder's agreement with its rules of spending. Written through the app's own gestures.

// Joined to a Compte Kete on this machine (kete-core's `pnpm platform`): its organization.
const joined = process.env.KETE_DEMO_JOINED === 'on';
export const DEMO_ORGANIZATION = (joined && process.env.KETE_DEMO_ORGANIZATION) || 'org_demo_commitments';

const person = (userId: string, name: string, role: KeteIdentity['role']): KeteIdentity => ({
  userId,
  email: `${userId}@example.test`,
  name,
  organizationId: DEMO_ORGANIZATION,
  role,
  apps: {},
  twoFactor: false,
  expiresAt: new Date(Date.now() + 8 * 3_600_000),
});

export const demoPeople = {
  // Joined: the person signed in through the Compte Kete is the owner.
  owner: person((joined && process.env.KETE_DEMO_ME) || 'usr_demo_afi', 'Afi Mensah', 'owner'),
  manager: person('usr_demo_lawson', 'Mme Lawson', 'member'),
  staff: person('usr_demo_kossi', 'Kossi Adjo', 'member'),
} as const;

async function act<T = Record<string, unknown>>(who: KeteIdentity, name: string, input: unknown): Promise<T> {
  const result = await asPerson(who, () =>
    registry.invoke({
      actor: screenActor(who),
      organizationId: DEMO_ORGANIZATION,
      name,
      input,
      confirmed: true,
    }),
  );
  if (result.status !== 'done') throw new Error(`${name}: ${JSON.stringify(result)}`);
  return result.output as T;
}

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

export async function seedDemo(): Promise<void> {
  const { manager } = demoPeople;
  await transaction(DEMO_ORGANIZATION, async (db) => {
    await assignBusinessRole(db, DEMO_ORGANIZATION, manager.userId, 'manager');
    await assignBusinessRole(db, DEMO_ORGANIZATION, demoPeople.staff.userId, 'staff');
  });
  type Written = { contractId: string };

  const clinic = await act<Written>(manager, 'contracts_write', {
    kind: 'client',
    reference: 'MAR-2026-014',
    title: 'Centrale solaire 12 kWc, clés en main',
    partyName: 'Clinique Biasa',
    projectId: 'prj_demo_clinique_biasa',
    projectName: 'Centrale solaire — Clinique Biasa',
    amount: 4_637_400,
    signedOn: day(-40),
    startsOn: day(-35),
    endsOn: day(50),
  });
  await act(manager, 'obligations_add', {
    ...clinic,
    label: 'Mise en service et procès-verbal de réception',
    owedBy: 'us',
    dueOn: day(12),
    clause: 'Art. 6 — Le Titulaire procède à la mise en service au plus tard le soixantième jour suivant l’ordre de service.',
  });
  await act(manager, 'obligations_add', {
    ...clinic,
    label: 'Paiement du deuxième acompte (40 %)',
    owedBy: 'them',
    dueOn: day(-3),
    clause: 'Art. 9.2 — Un deuxième acompte de 40 % est versé à la livraison du matériel sur site.',
  });
  await act(manager, 'securities_add', {
    ...clinic,
    kind: 'retention',
    amount: 231_870,
    releaseOn: day(330),
    clause: 'Art. 10 — Une retenue de garantie de 5 % est prélevée et libérée douze mois après la réception.',
  });

  const supplier = await act<Written>(manager, 'contracts_write', {
    kind: 'supplier',
    reference: 'CADRE-SOLARTECH-2026',
    title: 'Accord-cadre de fourniture de panneaux et onduleurs',
    partyName: 'Solartech',
    signedOn: day(-200),
    startsOn: day(-200),
    endsOn: day(165),
  });
  await act(manager, 'securities_add', {
    ...supplier,
    kind: 'bond',
    amount: 500_000,
    releaseOn: day(-10),
    clause: 'Art. 4 — La caution de bonne exécution est restituée à l’échéance de la première année.',
  });

  const grant = await act<Written>(manager, 'contracts_write', {
    kind: 'funding',
    reference: 'CONV-FONDS-ER-2026-07',
    title: 'Convention de financement — électrification des centres de santé',
    partyName: 'Fonds Énergie Rurale',
    projectId: 'prj_demo_clinique_biasa',
    projectName: 'Centrale solaire — Clinique Biasa',
    amount: 3_000_000,
    signedOn: day(-60),
    startsOn: day(-60),
    endsOn: day(120),
  });
  await act(manager, 'rules_add', {
    ...grant,
    kind: 'eligible_posts',
    posts: ['Matériel', 'Main-d’œuvre'],
    clause: 'Art. 5.1 — Les fonds financent exclusivement l’acquisition du matériel et la main-d’œuvre d’installation.',
  });
  await act(manager, 'rules_add', {
    ...grant,
    kind: 'single_ceiling',
    amount: 1_500_000,
    clause: 'Art. 5.3 — Toute dépense unitaire supérieure à 1 500 000 F CFA requiert l’avis préalable du Fonds.',
  });
  await act(manager, 'rules_add', {
    ...grant,
    kind: 'excluded_words',
    words: ['véhicule', 'carburant', 'per diem'],
    clause: 'Art. 5.4 — Sont exclus les véhicules, le carburant et les indemnités journalières.',
  });
  await act(manager, 'rules_add', {
    ...grant,
    kind: 'period',
    clause: 'Art. 3 — Seules les dépenses engagées pendant la durée de la convention sont éligibles.',
  });
  await act(manager, 'obligations_add', {
    ...grant,
    label: 'Rapport financier intermédiaire au Fonds',
    owedBy: 'us',
    dueOn: day(20),
    clause: 'Art. 8 — Un rapport financier intermédiaire est remis au plus tard au quatrième mois.',
  });
}
