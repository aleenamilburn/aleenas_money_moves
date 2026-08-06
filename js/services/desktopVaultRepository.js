import {PRODUCT_NAME, V1_VAULT_AAD, V2_VAULT_AAD} from '../domain/constants.js';

const KDF_ITERATIONS = 600000;
const NO_VAULT_GENERATION = 'mmvg:none';
const VAULT_BINDING_VERSION = 'generation-v1';
const GENERATION_PATTERN = /^mmvg:(?:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|none)$/i;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class DesktopVaultError extends Error {
  constructor(code, message = 'Money Moves could not complete the encrypted vault operation.') {
    super(message);
    this.name = 'DesktopVaultError';
    this.code = code;
  }
}

function desktopApi() {
  const api = globalThis.moneyMovesDesktop?.vault;
  if (!api) throw new DesktopVaultError('PERSISTENCE_FAILED');
  return api;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function assertGeneration(value, {allowNone = false} = {}) {
  if (typeof value !== 'string' || !GENERATION_PATTERN.test(value) || (!allowNone && value === NO_VAULT_GENERATION)) {
    throw new DesktopVaultError('INVALID_VAULT_ENVELOPE', 'The encrypted vault envelope is not valid.');
  }
  return value;
}

function createGeneration() {
  return assertGeneration(`mmvg:${crypto.randomUUID()}`);
}

function assertSequence(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new DesktopVaultError('INVALID_VAULT_ENVELOPE', 'The encrypted vault envelope is not valid.');
  return value;
}

function nextSequence(meta, requested) {
  if (requested !== undefined) return assertSequence(requested);
  return meta?.vaultSequence ? assertSequence(meta.vaultSequence + 1) : 1;
}

function boundAad(generation, sequence) {
  return `${V2_VAULT_AAD}|generation:${assertGeneration(generation)}|sequence:${assertSequence(sequence)}`;
}

function aadForVault(vault) {
  if (vault?.cipher?.binding === VAULT_BINDING_VERSION) return boundAad(vault.vaultGeneration, vault.vaultSequence);
  return vault?.cipher?.aad || (vault?.version === 1 ? V1_VAULT_AAD : V2_VAULT_AAD);
}

export async function deriveDesktopVaultKey(passphrase, salt, iterations = KDF_ITERATIONS) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt, iterations}, material, {name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']);
}

function assertSupportedVault(vault) {
  if (!vault || ![1, 2].includes(vault.version) || vault.cipher?.name !== 'AES-GCM' || vault.kdf?.name !== 'PBKDF2') {
    throw new DesktopVaultError('INVALID_BACKUP', 'The encrypted backup is not valid.');
  }
}

function metaFromVault(vault) {
  return {
    createdAt:vault.createdAt,
    iterations:vault.kdf.iterations,
    salt:base64ToBytes(vault.kdf.salt),
    vaultGeneration:vault.vaultGeneration || null,
    vaultSequence:vault.vaultSequence ?? null
  };
}

async function decrypt(vault, key) {
  const plaintext = await crypto.subtle.decrypt(
    {name:'AES-GCM', iv:base64ToBytes(vault.cipher.iv), additionalData:encoder.encode(aadForVault(vault))},
    key,
    base64ToBytes(vault.cipher.ciphertext)
  );
  return JSON.parse(decoder.decode(plaintext));
}

async function encrypt(state, key, meta, generation, sequence) {
  const aad = boundAad(generation, sequence);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {name:'AES-GCM', iv, additionalData:encoder.encode(aad)}, key, encoder.encode(JSON.stringify(state))
  );
  return {
    version:2,
    product:PRODUCT_NAME,
    schemaVersion:Number(state?.schemaVersion || 0),
    createdAt:meta.createdAt || new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    kdf:{name:'PBKDF2', hash:'SHA-256', iterations:meta.iterations || KDF_ITERATIONS, salt:bytesToBase64(meta.salt)},
    cipher:{name:'AES-GCM', iv:bytesToBase64(iv), aad, binding:VAULT_BINDING_VERSION, ciphertext:bytesToBase64(new Uint8Array(ciphertext))},
    vaultGeneration:assertGeneration(generation),
    vaultSequence:assertSequence(sequence)
  };
}

function mapError(cause) {
  if (cause instanceof DesktopVaultError) return cause;
  const code = typeof cause?.code === 'string' ? cause.code : 'PERSISTENCE_FAILED';
  const supported = new Set(['VAULT_NOT_FOUND', 'VAULT_ALREADY_EXISTS', 'VAULT_CONFLICT', 'VAULT_CORRUPT', 'INVALID_VAULT_ENVELOPE', 'INVALID_BACKUP', 'FILE_PERMISSION_DENIED', 'FILE_WRITE_FAILED', 'FILE_READ_FAILED', 'FILE_TOO_LARGE', 'PERSISTENCE_FAILED']);
  return new DesktopVaultError(supported.has(code) ? code : 'PERSISTENCE_FAILED');
}

function serializeSelectedBackup(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new DesktopVaultError('PERSISTENCE_FAILED');
  if (result.status === 'cancelled') return null;
  if (result.status !== 'selected' || !result.encryptedEnvelope || typeof result.encryptedEnvelope !== 'object' || Array.isArray(result.encryptedEnvelope)) {
    throw new DesktopVaultError('PERSISTENCE_FAILED');
  }
  const raw = JSON.stringify(result.encryptedEnvelope);
  if (typeof raw !== 'string' || !raw) throw new DesktopVaultError('PERSISTENCE_FAILED');
  return raw;
}

async function readRecord() {
  try {
    const result = await desktopApi().read();
    if (!result?.encryptedEnvelope) return null;
    return {vault:result.encryptedEnvelope, raw:JSON.stringify(result.encryptedEnvelope), storageKey:'desktop:active.mmvault'};
  } catch (cause) { throw mapError(cause); }
}

export function createDesktopVaultRepository() {
  return {
    async hasVault() {
      try {
        const inspected = await desktopApi().inspect();
        if (inspected?.recoveryRequired) throw new DesktopVaultError('VAULT_CORRUPT', 'The encrypted vault needs recovery. Restore a known encrypted backup.');
        return Boolean(inspected?.exists);
      } catch (cause) { throw mapError(cause); }
    },
    readLegacyState() { return null; },
    readLocalV1Record() { return null; },
    localRecoveryStatus() { return {encryptedVault:false, encryptedVaultCorrupt:false, legacyState:false}; },
    async readVaultGeneration() {
      const record = await readRecord();
      return record?.vault.vaultGeneration || NO_VAULT_GENERATION;
    },
    async readVaultMetadata() {
      const record = await readRecord();
      return record ? metaFromVault(record.vault) : null;
    },
    subscribeToVaultChangedElsewhere() { return () => {}; },
    async create(state, passphrase) {
      try {
        const existing = await readRecord();
        if (existing) throw new DesktopVaultError('VAULT_ALREADY_EXISTS');
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await deriveDesktopVaultKey(passphrase, salt);
        const meta = {createdAt:new Date().toISOString(), iterations:KDF_ITERATIONS, salt};
        const envelope = await encrypt(state, key, meta, createGeneration(), 1);
        const saved = await desktopApi().create(envelope);
        return {state, key, meta:{...meta, vaultGeneration:saved.vaultGeneration, vaultSequence:1}, vaultGeneration:saved.vaultGeneration, sourceStorageKey:'desktop:active.mmvault', needsVaultMigration:false};
      } catch (cause) { throw mapError(cause); }
    },
    async unlock(passphrase) {
      const record = await readRecord();
      if (!record) throw new DesktopVaultError('VAULT_NOT_FOUND');
      try {
        assertSupportedVault(record.vault);
        const meta = metaFromVault(record.vault);
        const key = await deriveDesktopVaultKey(passphrase, meta.salt, meta.iterations);
        const state = await decrypt(record.vault, key);
        return {state, key, meta, vaultGeneration:meta.vaultGeneration, sourceStorageKey:record.storageKey, needsVaultMigration:record.vault.version !== 2 || record.vault.product !== PRODUCT_NAME || record.vault.cipher?.binding !== VAULT_BINDING_VERSION};
      } catch (cause) {
        if (cause instanceof DesktopVaultError) throw cause;
        throw new DesktopVaultError('WRONG_PASSPHRASE', 'The passphrase or encrypted vault could not be verified.');
      }
    },
    async save(state, key, meta, {expectedVaultGeneration = meta?.vaultGeneration, nextVaultSequence} = {}) {
      try {
        assertGeneration(expectedVaultGeneration, {allowNone:true});
        const sequence = nextSequence(meta, nextVaultSequence);
        const envelope = await encrypt(state, key, meta, createGeneration(), sequence);
        const saved = expectedVaultGeneration === NO_VAULT_GENERATION
          ? await desktopApi().restoreBackup(envelope, expectedVaultGeneration)
          : await desktopApi().save(envelope, expectedVaultGeneration);
        return {meta:{...metaFromVault(envelope), vaultGeneration:saved.vaultGeneration}, vaultGeneration:saved.vaultGeneration};
      } catch (cause) { throw mapError(cause); }
    },
    async changePassphrase(state, currentPassphrase, nextPassphrase, {expectedVaultGeneration, nextVaultSequence} = {}) {
      try {
        const record = await readRecord();
        if (!record || record.vault.vaultGeneration !== expectedVaultGeneration) throw new DesktopVaultError('VAULT_CONFLICT');
        const oldMeta = metaFromVault(record.vault);
        const oldKey = await deriveDesktopVaultKey(currentPassphrase, oldMeta.salt, oldMeta.iterations);
        await decrypt(record.vault, oldKey);
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await deriveDesktopVaultKey(nextPassphrase, salt);
        const meta = {createdAt:oldMeta.createdAt, iterations:KDF_ITERATIONS, salt};
        const envelope = await encrypt(state, key, meta, createGeneration(), nextSequence(oldMeta, nextVaultSequence));
        const saved = await desktopApi().save(envelope, expectedVaultGeneration);
        return {key, meta:{...metaFromVault(envelope), vaultGeneration:saved.vaultGeneration}, vaultGeneration:saved.vaultGeneration};
      } catch (cause) {
        if (cause instanceof DesktopVaultError) throw cause;
        throw new DesktopVaultError('WRONG_PASSPHRASE', 'The passphrase or encrypted vault could not be verified.');
      }
    },
    async exportEncryptedBackup() {
      try { return await desktopApi().exportBackup(); } catch (cause) { throw mapError(cause); }
    },
    async importEncryptedBackup() {
      try {
        const result = await desktopApi().importBackup();
        return serializeSelectedBackup(result);
      } catch (cause) { throw mapError(cause); }
    },
    async verifyBackup(raw, passphrase) {
      try {
        const vault = JSON.parse(raw);
        assertSupportedVault(vault);
        const meta = metaFromVault(vault);
        const key = await deriveDesktopVaultKey(passphrase, meta.salt, meta.iterations);
        const state = await decrypt(vault, key);
        return {vault, state, key, meta, vaultGeneration:meta.vaultGeneration, needsVaultMigration:vault.version !== 2 || vault.product !== PRODUCT_NAME};
      } catch (cause) {
        if (cause instanceof DesktopVaultError) throw cause;
        throw new DesktopVaultError('INVALID_BACKUP', 'The encrypted backup or passphrase could not be verified.');
      }
    },
    clearCurrentVault() {}
  };
}

export const desktopVaultConstants = Object.freeze({KDF_ITERATIONS, NO_VAULT_GENERATION, VAULT_BINDING_VERSION});
