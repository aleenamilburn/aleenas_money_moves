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
    async create(passphrase, initialState = seed, options = {}) {
      const migration = migrateForUse(initialState);
      const created = await repository.create(migration.state, passphrase, options.coordination);
      return {...created, state:migration.state, migration};
    },
    async unlock(passphrase) {
      const unlocked = await repository.unlock(passphrase);
      const migration = migrateForUse(unlocked.state);
      let meta = unlocked.meta;
      let vaultGeneration = unlocked.vaultGeneration;
      if (unlocked.needsVaultMigration || migration.changed || !sameState(unlocked.state, migration.state)) {
        const saved = await repository.save(migration.state, unlocked.key, unlocked.meta, {
          expectedVaultGeneration:unlocked.vaultGeneration,
          ...unlocked.coordination
        });
        meta = saved.meta;
        vaultGeneration = saved.vaultGeneration;
      }
      return {...unlocked, state:migration.state, meta, vaultGeneration, migration};
    },
    async save(state, key, meta, {expectedVaultGeneration = meta?.vaultGeneration, coordination} = {}) {
      const migration = migrateForUse(state);
      const saved = await repository.save(migration.state, key, meta, {expectedVaultGeneration, ...coordination});
      return {...saved, state:migration.state, migration};
    },
    async changePassphrase(state, currentPassphrase, nextPassphrase, {expectedVaultGeneration, coordination} = {}) {
      const migration = migrateForUse(state);
      const expected = expectedVaultGeneration ?? await repository.readVaultGeneration();
      const changed = await repository.changePassphrase(migration.state, currentPassphrase, nextPassphrase, {
        expectedVaultGeneration:expected,
        ...coordination
      });
      return {...changed, state:migration.state, migration};
    },
    exportEncryptedBackup() {
      return repository.exportEncryptedBackup();
    },
    async restore(raw, passphrase, {expectedVaultGeneration, coordination} = {}) {
      const expected = expectedVaultGeneration ?? await repository.readVaultGeneration();
      const verified = await repository.verifyBackup(raw, passphrase);
      const migration = migrateForUse(verified.state);
      // save() writes the V2 vault only after decryption and migration validation have both succeeded.
      const saved = await repository.save(migration.state, verified.key, verified.meta, {
        expectedVaultGeneration:expected,
        ...coordination
      });
      return {...verified, ...saved, state:migration.state, migration};
    },
    clearCurrentVault() {
      return repository.clearCurrentVault();
    }
  };
}
