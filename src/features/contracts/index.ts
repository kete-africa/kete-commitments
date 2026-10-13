// The contracts feature's only door: what the rest of the app may use.
export {
  commitmentsCapabilities,
  commitmentsDatasets,
  commitmentsEvents,
  commitmentsPermissions,
} from './capabilities';
export { contractsMigrationSql } from './infrastructure/contracts.table';
export type { Contract, ContractFile, Obligation, Security } from './contract.record';
