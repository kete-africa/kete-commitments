import { createServerFn } from '@tanstack/react-start';
import { getCenter } from '@/platform/center';
import { transaction } from '@/platform/db';
import { holds } from '@/platform/rights';
import { perform, ScreenError, signedIn } from '@/platform/screen';
import { toRecover } from './domain/contracts';
import {
  contractFile,
  obligationsDue,
  searchContracts,
  securitiesHeld,
} from './infrastructure/contracts.table';
import {
  contractInput,
  contractRef,
  obligationInput,
  obligationRef,
  ruleInput,
  securityInput,
  securityRecovery,
} from './contract.record';

type Facts = Record<string, string | number>;

/** What the screen hears: the output, or the refusal's code with the facts its words name. */
const answer = <T>(
  outcome: { ok: true; output: T } | { ok: false; code: string; facts?: Facts },
) =>
  outcome.ok
    ? { ok: true as const, output: outcome.output }
    : { ok: false as const, code: outcome.code, facts: outcome.facts ?? {} };

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function reading<T>(work: (organizationId: string, token: string | null) => Promise<T>): Promise<T> {
  const { caller, as, token } = await signedIn();
  return as(async () => {
    if (!holds('commitments:read')) throw new ScreenError('forbidden');
    return work(caller.organizationId, token);
  });
}

export const fetchCommitments = createServerFn({ method: 'GET' }).handler(() =>
  reading((organizationId) =>
    transaction(organizationId, async (db) => ({
      today: today(),
      manage: holds('commitments:manage'),
      contracts: await searchContracts(db, { limit: 200 }),
      due: await obligationsDue(db, inDays(30)),
      toRecover: (await securitiesHeld(db)).filter((held) => toRecover(held, today())),
    })),
  ),
);

export const fetchContract = createServerFn({ method: 'GET' })
  .validator((input: unknown) => contractRef.parse(input))
  .handler(({ data }) =>
    reading((organizationId) =>
      transaction(organizationId, async (db) => ({
        today: today(),
        manage: holds('commitments:manage'),
        contract: await contractFile(db, data.contractId),
      })),
    ),
  );

/** What a new contract starts from: her open projects at the center, when there is one. */
export const fetchContractForm = createServerFn({ method: 'GET' }).handler(() =>
  reading(async (_organizationId, token) => {
    const center = getCenter();
    return {
      connected: center.connected,
      projects: (await center.projects(token))
        .filter((project) => project.status === 'open')
        .map((project) => ({ projectId: project.projectId, name: project.name })),
      parties: (await center.parties(token)).map((party) => ({
        partyId: party.partyId,
        name: party.name,
      })),
    };
  }),
);

export const writeContract = createServerFn({ method: 'POST' })
  .validator((input: unknown) => contractInput.parse(input))
  .handler(async ({ data }) => answer(await perform<{ contractId: string }>('contracts_write', data)));

export const addObligation = createServerFn({ method: 'POST' })
  .validator((input: unknown) => obligationInput.parse(input))
  .handler(async ({ data }) => answer(await perform<{ obligationId: string }>('obligations_add', data)));

export const meetObligation = createServerFn({ method: 'POST' })
  .validator((input: unknown) => obligationRef.parse(input))
  .handler(async ({ data }) => answer(await perform<{ obligationId: string }>('obligations_meet', data)));

export const addSecurity = createServerFn({ method: 'POST' })
  .validator((input: unknown) => securityInput.parse(input))
  .handler(async ({ data }) => answer(await perform<{ securityId: string }>('securities_add', data)));

export const recoverSecurity = createServerFn({ method: 'POST' })
  .validator((input: unknown) => securityRecovery.parse(input))
  .handler(async ({ data }) => answer(await perform<{ securityId: string }>('securities_recover', data)));

export const addRule = createServerFn({ method: 'POST' })
  .validator((input: unknown) => ruleInput.parse(input))
  .handler(async ({ data }) => answer(await perform<{ ruleId: string }>('rules_add', data)));
