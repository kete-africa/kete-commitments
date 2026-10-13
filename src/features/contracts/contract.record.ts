import { z } from 'zod';
import {
  contractKinds,
  ruleKinds,
  securityKinds,
  type ContractKind,
  type SecurityKind,
  type SpendingRule,
} from './domain/contracts';

// Contracts, their obligations, retentions and bonds, and a funder's rules — described once.

const id = z.string().min(1).max(64);
const day = z.iso.date();
const amount = z.number().int().min(0).max(1_000_000_000_000);
/** The passage of the contract, as it is written. */
const clause = z.string().trim().min(1).max(2000);

export const contractInput = z.object({
  kind: z.enum(contractKinds),
  /** Its own reference: the number on the signed paper. */
  reference: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  partyId: z.string().max(64).optional(),
  partyName: z.string().trim().max(200).optional(),
  projectId: z.string().max(64).optional(),
  /** The project's name, when no center gives it. */
  projectName: z.string().trim().max(200).optional(),
  amount: amount.optional(),
  signedOn: day.optional(),
  startsOn: day.optional(),
  endsOn: day.optional(),
});

export const contractRef = z.object({ contractId: id });

export const obligationInput = z.object({
  contractId: id,
  label: z.string().trim().min(1).max(300),
  /** Who must do it: us, or the other party. */
  owedBy: z.enum(['us', 'them']),
  dueOn: day,
  clause,
});
export const obligationRef = z.object({ obligationId: id });

export const securityInput = z.object({
  contractId: id,
  kind: z.enum(securityKinds),
  amount: amount.min(1),
  /** The day it may be claimed back. */
  releaseOn: day.optional(),
  clause,
});
export const securityRecovery = z.object({ securityId: id, recoveredOn: day });

export const ruleInput = z.object({
  contractId: id,
  kind: z.enum(ruleKinds),
  posts: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  amount: amount.optional(),
  words: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  clause,
});

/** What a project is about to spend, asked by an app before it commits it. */
export const spendInput = z.object({
  projectId: id,
  post: z.string().trim().max(80).optional(),
  amount,
  label: z.string().trim().min(1).max(300),
  on: day,
});

export interface Contract {
  contractId: string;
  kind: ContractKind;
  reference: string;
  title: string;
  partyId: string | null;
  partyName: string | null;
  projectId: string | null;
  projectName: string | null;
  amount: number | null;
  currency: string;
  signedOn: string | null;
  startsOn: string | null;
  endsOn: string | null;
}

export interface Obligation {
  obligationId: string;
  contractId: string;
  contractReference: string;
  label: string;
  owedBy: 'us' | 'them';
  dueOn: string;
  clause: string;
  doneOn: string | null;
}

export interface Security {
  securityId: string;
  contractId: string;
  contractReference: string;
  kind: SecurityKind;
  amount: number;
  currency: string;
  releaseOn: string | null;
  recoveredOn: string | null;
  clause: string;
}

export interface ContractFile extends Contract {
  obligations: Obligation[];
  securities: Security[];
  rules: SpendingRule[];
}
