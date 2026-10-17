import { agentConversationsMigrationSql, agentMemoryMigrationSql } from '@kete/agents';
import { usageMigrationSql } from '@kete/analytics';
import { businessRolesMigrationSql } from '@kete/capabilities';
import { commandsDelegationMigrationSql, commandsMigrationSql } from '@kete/commands';
import { chatOutboxMigrationSql } from '@kete/notify';
import { draftsMigrationSql } from '@kete/drafts';
import { feedbackMigrationSql } from '@kete/feedback';
import { outboxMigrationSql } from '@kete/sdk';
import { settingsMigrationSql } from '@kete/settings';
import { contractsMigrationSql } from '@/features/contracts';

export interface MigrationContext {
  schema: string;
  appRole: string;
  ownerRole: string;
}

export interface Migration {
  name: string;
  sql(context: MigrationContext): string;
}

/**
 * The app's migrations, in order; never edit one that ran. Every table comes with its row-level
 * security in the same migration (constitution V).
 */
export const migrations: Migration[] = [
  {
    // The tables kete-core provides: command journal, drafts, event outbox, feedback.
    name: '0000_kete',
    sql: (context) =>
      [
        commandsMigrationSql(context),
        draftsMigrationSql(context),
        outboxMigrationSql(context),
        feedbackMigrationSql(context),
      ].join('\n'),
  },
  // Contracts, their obligations, retentions and bonds, a funder's rules of spending (spec 001).
  { name: '0001_contracts', sql: (context) => contractsMigrationSql(context) },
  // The journal keeps the chain of agents behind each gesture (doctrine D-039).
  { name: '0002_kete_delegation', sql: (context) => commandsDelegationMigrationSql(context) },
  // The business events to the center, in their own outbox (kete-core spec 049).
  {
    name: '0003_kete_center_outbox',
    sql: (context) => outboxMigrationSql({ ...context, name: 'kete_center_outbox' }),
  },
  // The roles of the app's trade, and what the owner decided for each (kete-core spec 093).
  { name: '0004_kete_business_roles', sql: (context) => businessRolesMigrationSql(context) },
  // WhatsApp and Telegram: senders, contacts, words, every message (kete-core spec 088).
  { name: '0005_kete_chat', sql: (context) => chatOutboxMigrationSql(context) },
  // The assistant: its conversations and what a person asked it to remember (specs 089, 090).
  {
    name: '0006_kete_agents',
    sql: (context) =>
      [agentConversationsMigrationSql(context), agentMemoryMigrationSql(context)].join('\n'),
  },
  // Who uses what, per organization (kete-core spec 091).
  { name: '0007_kete_usage', sql: (context) => usageMigrationSql(context) },
  // The app's settings and their journal: the currency of contracts (spec 004).
  { name: '0008_kete_settings', sql: (context) => settingsMigrationSql(context) },
];
