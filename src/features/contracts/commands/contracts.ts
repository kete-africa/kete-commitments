import { defineCommand } from '@kete/commands';
import { z } from 'zod';
import { announce } from '@/platform/announce';
import { getCenter } from '@/platform/center';
import { actingFor, currentToken } from '@/platform/person';
import { ContractRuleError } from '../domain/contracts';
import {
  completeObligation,
  findContract,
  findObligation,
  findSecurity,
  insertContract,
  insertObligation,
  insertRule,
  insertSecurity,
  recoverSecurity,
} from '../infrastructure/contracts.table';
import {
  contractInput,
  obligationInput,
  obligationRef,
  ruleInput,
  securityInput,
  securityRecovery,
} from '../contract.record';

/** The currency of the deployment's contracts (ISO 4217); F CFA by default. */
const CURRENCY = (process.env.COMMITMENTS_CURRENCY ?? 'XOF').toUpperCase();
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Writes a contract: its kind, its reference, its party and its project — read at the center,
 * where she must see it. Without a center, the project is named by who writes.
 */
export const writeContract = defineCommand({
  name: 'write-contract',
  input: contractInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) {
      throw new ContractRuleError('period_invalid');
    }
    let projectName: string | null = null;
    if (input.projectId) {
      const center = getCenter();
      if (center.connected) {
        const project = await center.project(currentToken(), input.projectId);
        if (!project) throw new ContractRuleError('not_of_project');
        projectName = project.name;
      } else {
        projectName = input.projectName ?? input.projectId;
      }
    }
    const contractId = await insertContract(db, {
      organizationId,
      kind: input.kind,
      reference: input.reference,
      title: input.title,
      partyId: input.partyId ?? null,
      partyName: input.partyName ?? null,
      projectId: input.projectId ?? null,
      projectName,
      amount: input.amount ?? null,
      currency: CURRENCY,
      signedOn: input.signedOn ?? null,
      startsOn: input.startsOn ?? null,
      endsOn: input.endsOn ?? null,
      createdBy: actingFor(actor),
    });
    await announce(db, {
      type: 'contract.written',
      organization: organizationId,
      data: { contractId, kind: input.kind, projectId: input.projectId ?? null },
    });
    return { contractId };
  },
  summarize: (input) => `Contract ${input.reference} written`,
});

/** Writes an obligation of a contract, with its day and the passage it comes from. */
export const addObligation = defineCommand({
  name: 'add-obligation',
  input: obligationInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    if (!(await findContract(db, input.contractId))) throw new ContractRuleError('contract_not_found');
    return { obligationId: await insertObligation(db, organizationId, input) };
  },
  summarize: (input) => `Obligation added to ${input.contractId}`,
});

/** Says an obligation was met. */
export const meetObligation = defineCommand({
  name: 'meet-obligation',
  input: obligationRef.extend({ doneOn: z.iso.date().optional() }),
  reversibility: { reversible: false },
  async handler({ obligationId, doneOn }, { db, actor }) {
    const obligation = await findObligation(db, obligationId);
    if (!obligation) throw new ContractRuleError('obligation_not_found');
    if (obligation.doneOn) throw new ContractRuleError('already_done');
    await completeObligation(db, obligationId, { on: doneOn ?? today(), by: actingFor(actor) });
    return { obligationId };
  },
  summarize: ({ obligationId }) => `Obligation ${obligationId} met`,
});

/** Writes a retention or a bond held under a contract: money to recover on its day. */
export const addSecurity = defineCommand({
  name: 'add-security',
  input: securityInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    if (!(await findContract(db, input.contractId))) throw new ContractRuleError('contract_not_found');
    return { securityId: await insertSecurity(db, organizationId, input) };
  },
  summarize: (input) => `${input.kind} added to ${input.contractId}`,
});

export const recoverHeld = defineCommand({
  name: 'recover-security',
  input: securityRecovery,
  reversibility: { reversible: false },
  async handler({ securityId, recoveredOn }, { db }) {
    const security = await findSecurity(db, securityId);
    if (!security) throw new ContractRuleError('security_not_found');
    if (security.recoveredOn) throw new ContractRuleError('already_recovered');
    await recoverSecurity(db, securityId, recoveredOn);
    return { securityId };
  },
  summarize: ({ securityId }) => `Security ${securityId} recovered`,
});

/**
 * Writes a rule of spending of a funding agreement, with its passage: the posts it pays, the
 * most one expense may be, what it never pays, the period it pays in.
 */
export const addRule = defineCommand({
  name: 'add-spending-rule',
  input: ruleInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    const contract = await findContract(db, input.contractId);
    if (!contract) throw new ContractRuleError('contract_not_found');
    if (contract.kind !== 'funding') throw new ContractRuleError('not_a_funding');
    const complete =
      (input.kind === 'eligible_posts' && input.posts.length > 0) ||
      (input.kind === 'single_ceiling' && input.amount !== undefined) ||
      (input.kind === 'excluded_words' && input.words.length > 0) ||
      (input.kind === 'period' && (contract.startsOn !== null || contract.endsOn !== null));
    if (!complete) throw new ContractRuleError('rule_incomplete');
    return { ruleId: await insertRule(db, organizationId, input) };
  },
  summarize: (input) => `Rule ${input.kind} added to ${input.contractId}`,
});
