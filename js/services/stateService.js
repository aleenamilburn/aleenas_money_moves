import {migrateState, validateFoundationDomain} from '../domain/migrations.js';
import {getStateRevision} from './stateRevision.js';

function sameState(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertFoundationState(migration) {
  getStateRevision(migration.state);
  const validation = validateFoundationDomain(migration.state.domain);
  if (!validation.ok) throw new Error(`Migrated state failed foundation validation: ${validation.errors.join('; ')}`);
  return migration;
}

export function createStateService({repository, seed, migrate = migrateState} = {}) {
  if (!repository) throw new Error('State service requires a vault repository.');

  function migrateForUse(input) {
    return assertFoundationState(migrate(input || seed));
  }

  return {
    hasVault() {
      return repository.hasVault();
    },
    readLegacyState() {
      return repository.readLegacyState();
    },
    async create(passphrase, initialState = seed) {
      const migration = migrateForUse(initialState);
      const created = await repository.create(migration.state, passphrase);
      return {...created, state:migration.state, migration};
    },
    async unlock(passphrase) {
      const unlocked = await repository.unlock(passphrase);
      const migration = migrateForUse(unlocked.state);
      let meta = unlocked.meta;
      if (unlocked.needsVaultMigration || migration.changed || !sameState(unlocked.state, migration.state)) {
        meta = await repository.save(migration.state, unlocked.key, unlocked.meta);
      }
      return {...unlocked, state:migration.state, meta, migration};
    },
    async save(state, key, meta) {
      const migration = migrateForUse(state);
      const savedMeta = await repository.save(migration.state, key, meta);
      return {meta:savedMeta, state:migration.state, migration};
    },
    async changePassphrase(state, currentPassphrase, nextPassphrase) {
      const migration = migrateForUse(state);
      const changed = await repository.changePassphrase(migration.state, currentPassphrase, nextPassphrase);
      return {...changed, state:migration.state, migration};
    },
    exportEncryptedBackup() {
      return repository.exportEncryptedBackup();
    },
    async restore(raw, passphrase) {
      const verified = await repository.verifyBackup(raw, passphrase);
      const migration = migrateForUse(verified.state);
      // save() writes the V2 vault only after decryption and migration validation have both succeeded.
      const meta = await repository.save(migration.state, verified.key, verified.meta);
      return {...verified, state:migration.state, meta, migration};
    },
    clearCurrentVault() {
      return repository.clearCurrentVault();
    }
  };
}
