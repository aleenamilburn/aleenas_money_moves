export const PRODUCT_NAME = 'Money Moves';
export const STATE_SCHEMA_VERSION = 7;
export const DEFAULT_CURRENCY = 'USD';
export const UNKNOWN_ACCOUNT_ID = 'unknown-account';

// V2_VAULT_KEY, V2_TEMP_VAULT_KEY, and V2_VAULT_WRITE_LEASE_KEY (former localStorage
// keys for the active vault, its in-flight temp record, and the persisted write
// lease) were retired when the vault moved to hosted storage — Postgres's atomic
// conditional write superseded all three. The platform lock name lives on: it is
// still the same-device Web Lock name, now a coalescing optimization rather than
// the write-safety authority. See js/services/hostedVaultStorage.js.
export const V2_VAULT_PLATFORM_LOCK_NAME = 'money-moves-vault-v2-writer';
export const V1_VAULT_KEY = 'verdant-vault-v1';
export const V1_TEMP_VAULT_KEY = 'verdant-vault-v1-temp';
export const V1_LEGACY_STATE_KEY = 'verdant-console-v2';

export const V1_VAULT_AAD = 'Verdant Vault v1';
export const V2_VAULT_AAD = 'Money Moves Vault v2';
