import * as vault from '../vault.js';

export function createVaultRepository(vaultApi = vault) {
  return {
    hasVault() {
      return typeof vaultApi.hasVault === 'function'
        ? vaultApi.hasVault()
        : Boolean(vaultApi.readVaultRecord());
    },
    readLegacyState() {
      return vaultApi.readLegacyState();
    },
    async readVaultGeneration() {
      return vaultApi.readVaultGeneration();
    },
    isActiveVaultStorageKey(storageKey) {
      return storageKey === vaultApi.vaultConstants?.VAULT_KEY;
    },
    async create(state, passphrase, options) {
      return vaultApi.createVault(state, passphrase, options);
    },
    async unlock(passphrase) {
      return vaultApi.unlock(passphrase);
    },
    async save(state, key, meta, options) {
      return vaultApi.saveVault(state, key, meta, options);
    },
    async changePassphrase(state, currentPassphrase, nextPassphrase, options) {
      return vaultApi.changePassphrase(state, currentPassphrase, nextPassphrase, options);
    },
    exportEncryptedBackup() {
      return vaultApi.exportEncryptedBackup();
    },
    async verifyBackup(raw, passphrase) {
      return vaultApi.verifyBackup(raw, passphrase);
    },
    clearCurrentVault() {
      return vaultApi.clearVault();
    }
  };
}
