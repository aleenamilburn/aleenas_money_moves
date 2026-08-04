import * as vault from '../vault.js';

export function createVaultRepository(vaultApi = vault) {
  return {
    async hasVault() {
      return vaultApi.hasVault();
    },
    readLegacyState() {
      return vaultApi.readLegacyState();
    },
    readLocalV1Record() {
      return vaultApi.readLocalV1Record();
    },
    async readVaultGeneration() {
      return vaultApi.readVaultGeneration();
    },
    // Same-device early warning only, replacing the native `storage` event that
    // never fires once the vault leaves localStorage. Not authoritative.
    subscribeToVaultChangedElsewhere(callback) {
      return vaultApi.subscribeToVaultChangedElsewhere(callback);
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
    async exportEncryptedBackup() {
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
