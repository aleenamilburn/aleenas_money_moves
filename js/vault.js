import {
  PRODUCT_NAME,
  V1_LEGACY_STATE_KEY,
  V1_TEMP_VAULT_KEY,
  V1_VAULT_AAD,
  V1_VAULT_KEY,
  V2_VAULT_AAD,
  V2_VAULT_PLATFORM_LOCK_NAME
} from './domain/constants.js';
import {
  HostedVaultAuthRequiredError, HostedVaultConflictError, HostedVaultNetworkError,
  createHostedRow, readHostedRow, subscribeToRemoteWrites, updateHostedRow
} from './services/hostedVaultStorage.js';

const KDF_ITERATIONS = 600000;
const NO_VAULT_GENERATION = 'mmvg:none';
const GENERATION_PATTERN = /^mmvg:(?:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|none)$/i;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class VaultConflictError extends Error {
  constructor(operation = 'save') {
    super('Money Moves was updated elsewhere. Reload this tab before saving.');
    this.name = 'VaultConflictError';
    this.code = 'VAULT_CONFLICT';
    this.operation = operation;
  }
}

export class VaultGenerationError extends Error {
  constructor() {
    super('Vault generation metadata is invalid.');
    this.name = 'VaultGenerationError';
    this.code = 'INVALID_VAULT_GENERATION';
  }
}

export class VaultPersistenceError extends Error {
  constructor(operation = 'save') {
    super('The encrypted Money Moves vault could not be saved.');
    this.name = 'VaultPersistenceError';
    this.code = 'VAULT_PERSISTENCE_FAILED';
    this.operation = operation;
  }
}

// Distinguishes "not signed in yet" from a conflict or a persistence failure so the
// UI can route to the sign-in screen instead of showing a generic save error.
export class VaultAuthRequiredError extends Error {
  constructor() {
    super('Sign in to reach your encrypted vault.');
    this.name = 'VaultAuthRequiredError';
    this.code = 'VAULT_AUTH_REQUIRED';
  }
}

function bytesToBase64(bytes) {
  let binary='';
  for (const byte of bytes) binary+=String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary=atob(value);
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
}

// --- V1 local recovery (unchanged, orphaned from the hosted flow by design) ---
//
// V1 data predates any notion of an authenticated account. It is never blended into
// a signed-in user's hosted vault automatically (no import, per product decision),
// but it is never deleted either — these functions remain available as manual
// recovery primitives.

function parseStoredVault(storageKey) {
  const raw=localStorage.getItem(storageKey);
  if (raw === null) return {exists:false, storageKey};
  try { return {exists:true, vault:JSON.parse(raw), raw, storageKey}; }
  catch { return {exists:true, raw, storageKey, error:new Error(`Vault record at ${storageKey} is not valid JSON.`)}; }
}

export function readLegacyState() {
  const raw=localStorage.getItem(V1_LEGACY_STATE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function readLocalV1Record() {
  const v1=parseStoredVault(V1_VAULT_KEY);
  if (v1.exists) { if (v1.error) throw v1.error; return {...v1, isLegacy:true, isTemporary:false}; }
  const temp=parseStoredVault(V1_TEMP_VAULT_KEY);
  if (temp.exists) { if (temp.error) throw temp.error; return {...temp, isLegacy:true, isTemporary:true}; }
  return null;
}

export function clearVault() {
  // Hosted rows are deleted by product/account deletion flows, not this call — this
  // clears only what ever lived in this browser's own storage. V1 keys are never
  // touched here; a V2 reset must not erase a recoverable V1 vault.
}

// --- generation helpers (unchanged format; now mirrored into the hosted row) ---

function createGeneration(options = {}) {
  const generation = options.generation || `mmvg:${crypto.randomUUID()}`;
  assertVaultGeneration(generation);
  if (generation === NO_VAULT_GENERATION) throw new VaultGenerationError();
  return generation;
}

function assertVaultGeneration(value) {
  if (typeof value !== 'string' || !GENERATION_PATTERN.test(value)) throw new VaultGenerationError();
  return value;
}

// --- crypto boundary (unchanged; storage-target-agnostic by construction) ---

export async function deriveKey(passphrase,salt,iterations=KDF_ITERATIONS) {
  const material=await crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2',hash:'SHA-256',salt,iterations},
    material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']
  );
}

function aadForVault(vault) {
  return vault?.cipher?.aad || (vault?.version === 1 ? V1_VAULT_AAD : V2_VAULT_AAD);
}

async function encryptState(state,key,meta,{vaultGeneration = null} = {}) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt(
    {name:'AES-GCM',iv,additionalData:encoder.encode(V2_VAULT_AAD)},
    key,encoder.encode(JSON.stringify(state))
  );
  const vault = {
    version:2,
    product:PRODUCT_NAME,
    schemaVersion:Number(state?.schemaVersion || 0),
    createdAt:meta.createdAt || new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    kdf:{name:'PBKDF2',hash:'SHA-256',iterations:meta.iterations||KDF_ITERATIONS,salt:bytesToBase64(meta.salt)},
    cipher:{name:'AES-GCM',iv:bytesToBase64(iv),aad:V2_VAULT_AAD,ciphertext:bytesToBase64(new Uint8Array(ciphertext))}
  };
  if (vaultGeneration !== null) vault.vaultGeneration = assertVaultGeneration(vaultGeneration);
  return vault;
}

async function decryptState(vault,key) {
  const plain=await crypto.subtle.decrypt(
    {name:'AES-GCM',iv:base64ToBytes(vault.cipher.iv),additionalData:encoder.encode(aadForVault(vault))},
    key,base64ToBytes(vault.cipher.ciphertext)
  );
  return JSON.parse(decoder.decode(plain));
}

function metaFromVault(vault) {
  return {
    createdAt:vault.createdAt,
    iterations:vault.kdf.iterations,
    salt:base64ToBytes(vault.kdf.salt),
    vaultGeneration:vault.vaultGeneration || null
  };
}

function assertSupportedVault(vault) {
  if (!vault || ![1,2].includes(vault.version) || vault.cipher?.name!=='AES-GCM' || vault.kdf?.name!=='PBKDF2') {
    throw new Error('Unsupported backup format.');
  }
}

// --- Web Lock: same-device optimization only, not the write-safety authority ---
//
// Correctness against concurrent writers (same device or different) is enforced by
// the hosted conditional write's row-count signal. The lock here only coalesces
// multiple tabs on this one device into serialized requests, avoiding wasted network
// round trips and keeping the existing same-device conflict-banner UX responsive.

function writerLockManager(options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, 'platformLockManager')) return options.platformLockManager;
  return globalThis.navigator?.locks || null;
}

async function withPlatformWriterLock(options, action) {
  const manager = writerLockManager(options);
  if (!manager || typeof manager.request !== 'function') return action();
  return manager.request(V2_VAULT_PLATFORM_LOCK_NAME, {mode:'exclusive'}, lock => {
    if (!lock) return action();
    return action();
  });
}

function mapHostedError(error, operation) {
  if (error instanceof HostedVaultConflictError) return new VaultConflictError(operation);
  if (error instanceof HostedVaultAuthRequiredError) return new VaultAuthRequiredError();
  if (error instanceof HostedVaultNetworkError) return new VaultPersistenceError(operation);
  return error;
}

// One coordinated write: encrypt already happened in the caller; this decrypts the
// freshly-encrypted vault locally (cheap, no network) to catch a broken ciphertext
// before ever sending it, then performs the single atomic write. `isCreate` selects
// insert-if-absent vs. conditional-update-if-matching; both paths share the same
// idempotent-retry-safe outcome contract (see hostedVaultStorage.js).
async function writeCoordinated(vault, key, {expectedVaultGeneration, operation = 'save', isCreate = false, ...options} = {}) {
  assertVaultGeneration(expectedVaultGeneration);
  return withPlatformWriterLock(options, async () => {
    try {
      await decryptState(vault, key);
    } catch {
      throw new VaultPersistenceError(operation);
    }
    if (typeof options.beforeNetworkWrite === 'function') await options.beforeNetworkWrite();
    try {
      const written = isCreate
        ? await createHostedRow({generation: vault.vaultGeneration, blob: vault})
        : await updateHostedRow({expectedGeneration: expectedVaultGeneration, nextGeneration: vault.vaultGeneration, blob: vault});
      if (typeof options.afterNetworkWrite === 'function') await options.afterNetworkWrite();
      return {meta: metaFromVault(vault), vaultGeneration: written.generation};
    } catch (error) {
      throw mapHostedError(error, operation);
    }
  });
}

export async function readVaultRecord() {
  let hostedRow;
  try {
    hostedRow = await readHostedRow();
  } catch (error) {
    throw mapHostedError(error, 'read');
  }
  if (!hostedRow) return null;
  return {
    exists:true,
    vault:hostedRow.blob,
    raw:JSON.stringify(hostedRow.blob),
    storageKey:'hosted:vaults',
    isLegacy:false,
    isTemporary:false
  };
}

export function readVault() {
  throw new Error('readVault() is synchronous and cannot reach hosted storage; use readVaultRecord() instead.');
}

export async function hasVault() {
  const record = await readVaultRecord();
  return record !== null;
}

export async function readVaultGeneration() {
  const record = await readVaultRecord();
  return record ? record.vault.vaultGeneration : NO_VAULT_GENERATION;
}

export async function createVault(state,passphrase,options = {}) {
  const existing = await readVaultRecord();
  if (existing) throw new VaultConflictError('create');
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await deriveKey(passphrase,salt);
  const meta={createdAt:new Date().toISOString(),iterations:KDF_ITERATIONS,salt};
  const generation = createGeneration(options);
  const vault=await encryptState(state,key,meta,{vaultGeneration:generation});
  const written = await writeCoordinated(vault,key,{...options, expectedVaultGeneration:NO_VAULT_GENERATION, operation:'create', isCreate:true});
  return {state,key,meta:written.meta,vaultGeneration:written.vaultGeneration,sourceStorageKey:'hosted:vaults',needsVaultMigration:false};
}

export async function unlock(passphrase) {
  const record=await readVaultRecord();
  if (!record) throw new Error('No encrypted vault exists.');
  assertSupportedVault(record.vault);
  const meta=metaFromVault(record.vault);
  const key=await deriveKey(passphrase,meta.salt,meta.iterations);
  const state=await decryptState(record.vault,key);
  const needsVaultMigration=record.vault.version !== 2 || record.vault.product !== PRODUCT_NAME;
  return {state,key,meta,vaultGeneration:meta.vaultGeneration,sourceStorageKey:record.storageKey,needsVaultMigration};
}

export async function saveVault(state,key,meta,{expectedVaultGeneration = meta?.vaultGeneration, ...options} = {}) {
  assertVaultGeneration(expectedVaultGeneration);
  const generation = createGeneration(options);
  const vault=await encryptState(state,key,meta,{vaultGeneration:generation});
  return writeCoordinated(vault,key,{...options, expectedVaultGeneration, operation:'save', isCreate:false});
}

export async function changePassphrase(state,currentPassphrase,newPassphrase,{expectedVaultGeneration, ...options} = {}) {
  assertVaultGeneration(expectedVaultGeneration);
  const currentRecord=await readVaultRecord();
  if (!currentRecord) throw new Error('No vault found.');
  assertSupportedVault(currentRecord.vault);
  if (currentRecord.vault.vaultGeneration !== expectedVaultGeneration) throw new VaultConflictError('change-passphrase');
  const currentMeta=metaFromVault(currentRecord.vault);
  const currentKey=await deriveKey(currentPassphrase,currentMeta.salt,currentMeta.iterations);
  await decryptState(currentRecord.vault,currentKey);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await deriveKey(newPassphrase,salt);
  const meta={createdAt:currentRecord.vault.createdAt,iterations:KDF_ITERATIONS,salt};
  const generation = createGeneration(options);
  const next=await encryptState(state,key,meta,{vaultGeneration:generation});
  const written=await writeCoordinated(next,key,{...options, expectedVaultGeneration, operation:'change-passphrase', isCreate:false});
  return {key,meta:written.meta,vaultGeneration:written.vaultGeneration};
}

export async function exportEncryptedBackup() {
  const record=await readVaultRecord();
  if (!record) throw new Error('No vault found.');
  return record.raw;
}

export async function verifyBackup(raw,passphrase) {
  const vault=JSON.parse(raw);
  assertSupportedVault(vault);
  const meta=metaFromVault(vault);
  const key=await deriveKey(passphrase,meta.salt,meta.iterations);
  const state=await decryptState(vault,key);
  return {vault,state,key,meta,vaultGeneration:meta.vaultGeneration,needsVaultMigration:vault.version !== 2 || vault.product !== PRODUCT_NAME};
}

// Same-device early warning only (see subscribeToRemoteWrites in hostedVaultStorage.js).
export function subscribeToVaultChangedElsewhere(callback) {
  return subscribeToRemoteWrites(callback);
}

export const vaultConstants={
  LEGACY_VAULT_KEY:V1_VAULT_KEY,
  LEGACY_TEMP_KEY:V1_TEMP_VAULT_KEY,
  LEGACY_STATE_KEY:V1_LEGACY_STATE_KEY,
  KDF_ITERATIONS,
  NO_VAULT_GENERATION,
  PLATFORM_LOCK_NAME:V2_VAULT_PLATFORM_LOCK_NAME
};
