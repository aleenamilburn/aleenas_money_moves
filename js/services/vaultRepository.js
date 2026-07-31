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
    async create(state, passphrase) {
      return vaultApi.createVault(state, passphrase);
    },
    async unlock(passphrase) {
      return vaultApi.unlock(passphrase);
    },
    async save(state, key, meta) {
      return vaultApi.saveVault(state, key, meta);
    },
    async changePassphrase(state, currentPassphrase, nextPassphrase) {
      return vaultApi.changePassphrase(state, currentPassphrase, nextPassphrase);
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
