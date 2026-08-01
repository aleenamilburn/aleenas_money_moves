import {
  PRODUCT_NAME,
  V1_LEGACY_STATE_KEY,
  V1_TEMP_VAULT_KEY,
  V1_VAULT_AAD,
  V1_VAULT_KEY,
  V2_TEMP_VAULT_KEY,
  V2_VAULT_AAD,
  V2_VAULT_KEY,
  V2_VAULT_WRITE_LEASE_KEY
} from './domain/constants.js';

const KDF_ITERATIONS = 600000;
const WRITE_LEASE_MS = 15000;
const NO_VAULT_GENERATION = 'mmvg:none';
const GENERATION_PATTERN = /^mmvg:(?:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|legacy-[A-Za-z0-9_-]{43}|none)$/i;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class VaultConflictError extends Error {
  constructor(operation = 'save') {
    super('Money Moves was updated in another tab. Reload this tab before saving.');
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

function bytesToBase64(bytes) {
  let binary='';
  for (const byte of bytes) binary+=String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary=atob(value);
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
}

function parseStoredVault(storageKey) {
  const raw=localStorage.getItem(storageKey);
  if (raw === null) return {exists:false, storageKey};
  try { return {exists:true, vault:JSON.parse(raw), raw, storageKey}; }
  catch { return {exists:true, raw, storageKey, error:new Error(`Vault record at ${storageKey} is not valid JSON.`)}; }
}

function parseLease() {
  const raw = localStorage.getItem(V2_VAULT_WRITE_LEASE_KEY);
  if (raw === null) return null;
  try {
    const lease = JSON.parse(raw);
    if (lease?.version !== 1 || typeof lease.ownerToken !== 'string' || !Number.isFinite(lease.expiresAt)) return null;
    return lease;
  } catch {
    return null;
  }
}

function currentTime(options = {}) {
  return typeof options.now === 'function' ? Number(options.now()) : Date.now();
}

function createOwnerToken(options = {}) {
  return options.ownerToken || `mm-owner:${crypto.randomUUID()}`;
}

function createGeneration(options = {}) {
  const generation = options.generation || `mmvg:${crypto.randomUUID()}`;
  assertVaultGeneration(generation);
  if (generation === NO_VAULT_GENERATION || generation.startsWith('mmvg:legacy-')) throw new VaultGenerationError();
  return generation;
}

function assertVaultGeneration(value) {
  if (typeof value !== 'string' || !GENERATION_PATTERN.test(value)) throw new VaultGenerationError();
  return value;
}

function generationFromEnvelope(vault) {
  if (!Object.prototype.hasOwnProperty.call(vault || {}, 'vaultGeneration')) return null;
  return assertVaultGeneration(vault.vaultGeneration);
}

async function digestRawVault(raw) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  return bytesToBase64(new Uint8Array(digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function generationForRecord(record) {
  if (!record) return NO_VAULT_GENERATION;
  const envelopeGeneration = generationFromEnvelope(record.vault);
  return envelopeGeneration || `mmvg:legacy-${await digestRawVault(record.raw)}`;
}

export function readVaultRecord() {
  const current=parseStoredVault(V2_VAULT_KEY);
  if (current.exists) {
    if (current.error) throw current.error;
    return {...current, isLegacy:false, isTemporary:false};
  }
  const temporary=parseStoredVault(V2_TEMP_VAULT_KEY);
  if (temporary.exists && !temporary.error) return {...temporary, isLegacy:false, isTemporary:true};
  const v1=parseStoredVault(V1_VAULT_KEY);
  if (v1.exists) {
    if (v1.error) throw v1.error;
    return {...v1, isLegacy:true, isTemporary:false};
  }
  const legacyTemporary=parseStoredVault(V1_TEMP_VAULT_KEY);
  if (legacyTemporary.exists && !legacyTemporary.error) return {...legacyTemporary, isLegacy:true, isTemporary:true};
  if (temporary.exists && temporary.error) throw temporary.error;
  if (legacyTemporary.exists && legacyTemporary.error) throw legacyTemporary.error;
  return null;
}

export function hasVault() {
  return [V2_VAULT_KEY, V2_TEMP_VAULT_KEY, V1_VAULT_KEY, V1_TEMP_VAULT_KEY].some(key => localStorage.getItem(key) !== null);
}

export function readVault() {
  return readVaultRecord()?.vault || null;
}

export async function readVaultGeneration() {
  return generationForRecord(readVaultRecord());
}

export function readLegacyState() {
  const raw=localStorage.getItem(V1_LEGACY_STATE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

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

async function encryptState(state,key,meta,{vaultGeneration = null, pendingWrite = null} = {}) {
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
  if (pendingWrite) vault.pendingWrite = pendingWrite;
  return vault;
}

async function decryptState(vault,key) {
  const plain=await crypto.subtle.decrypt(
    {name:'AES-GCM',iv:base64ToBytes(vault.cipher.iv),additionalData:encoder.encode(aadForVault(vault))},
    key,base64ToBytes(vault.cipher.ciphertext)
  );
  return JSON.parse(decoder.decode(plain));
}

function readLeaseOwnedBy(ownerToken, options = null) {
  const lease = parseLease();
  if (lease?.ownerToken !== ownerToken) return null;
  if (options && lease.expiresAt <= currentTime(options)) return null;
  return lease;
}

function acquireWriteLease(operation, options = {}) {
  const now = currentTime(options);
  const existing = parseLease();
  if (existing && existing.expiresAt > now) throw new VaultConflictError(operation);
  const ownerToken = createOwnerToken(options);
  const lease = {version:1, ownerToken, expiresAt:now + Number(options.leaseMs || WRITE_LEASE_MS)};
  localStorage.setItem(V2_VAULT_WRITE_LEASE_KEY, JSON.stringify(lease));
  if (!readLeaseOwnedBy(ownerToken, options)) throw new VaultConflictError(operation);
  return ownerToken;
}

function renewWriteLease(ownerToken, operation, options = {}) {
  if (!readLeaseOwnedBy(ownerToken, options)) throw new VaultConflictError(operation);
  const lease = {version:1, ownerToken, expiresAt:currentTime(options) + Number(options.leaseMs || WRITE_LEASE_MS)};
  localStorage.setItem(V2_VAULT_WRITE_LEASE_KEY, JSON.stringify(lease));
  if (!readLeaseOwnedBy(ownerToken, options)) throw new VaultConflictError(operation);
}

function releaseWriteLease(ownerToken) {
  if (readLeaseOwnedBy(ownerToken)) localStorage.removeItem(V2_VAULT_WRITE_LEASE_KEY);
}

function removeOwnedTemporary(ownerToken) {
  const record = parseStoredVault(V2_TEMP_VAULT_KEY);
  if (record.exists && !record.error && record.vault?.pendingWrite?.ownerToken === ownerToken) {
    localStorage.removeItem(V2_TEMP_VAULT_KEY);
  }
}

async function currentGenerationForWrite(expectedVaultGeneration, ownerToken = null) {
  const current = parseStoredVault(V2_VAULT_KEY);
  if (current.exists) {
    if (current.error) throw current.error;
    return generationForRecord({...current, isLegacy:false, isTemporary:false});
  }
  const temporary = parseStoredVault(V2_TEMP_VAULT_KEY);
  if (temporary.exists && !temporary.error) {
    const pending = temporary.vault?.pendingWrite;
    if (ownerToken && pending?.ownerToken === ownerToken && pending?.previousVaultGeneration === expectedVaultGeneration) {
      return expectedVaultGeneration;
    }
    return generationForRecord({...temporary, isLegacy:false, isTemporary:true});
  }
  const v1 = parseStoredVault(V1_VAULT_KEY);
  if (v1.exists) {
    if (v1.error) throw v1.error;
    return generationForRecord({...v1, isLegacy:true, isTemporary:false});
  }
  const legacyTemporary = parseStoredVault(V1_TEMP_VAULT_KEY);
  if (legacyTemporary.exists && !legacyTemporary.error) {
    return generationForRecord({...legacyTemporary, isLegacy:true, isTemporary:true});
  }
  if (temporary.exists && temporary.error) throw temporary.error;
  if (legacyTemporary.exists && legacyTemporary.error) throw legacyTemporary.error;
  return NO_VAULT_GENERATION;
}

async function assertExpectedGeneration(expectedVaultGeneration, operation, ownerToken = null) {
  assertVaultGeneration(expectedVaultGeneration);
  const current = await currentGenerationForWrite(expectedVaultGeneration, ownerToken);
  if (current !== expectedVaultGeneration) throw new VaultConflictError(operation);
}

async function writeCoordinated(vault,key,{expectedVaultGeneration, operation = 'save', ...options} = {}) {
  assertVaultGeneration(expectedVaultGeneration);
  const ownerToken = acquireWriteLease(operation, options);
  let preserveVerifiedTemporary = false;
  try {
    await assertExpectedGeneration(expectedVaultGeneration, operation, ownerToken);
    if (typeof options.beforeTemporaryWrite === 'function') await options.beforeTemporaryWrite();
    const vaultGeneration = createGeneration(options);
    const pendingWrite = {version:1, ownerToken, previousVaultGeneration:expectedVaultGeneration};
    const temporaryVault = {...vault, vaultGeneration, pendingWrite};
    localStorage.setItem(V2_TEMP_VAULT_KEY, JSON.stringify(temporaryVault));
    if (typeof options.afterTemporaryWrite === 'function') await options.afterTemporaryWrite();
    const storedTemporary = JSON.parse(localStorage.getItem(V2_TEMP_VAULT_KEY));
    await decryptState(storedTemporary, key);
    renewWriteLease(ownerToken, operation, options);
    if (typeof options.beforePromotion === 'function') await options.beforePromotion();
    if (!readLeaseOwnedBy(ownerToken, options)) throw new VaultConflictError(operation);
    await assertExpectedGeneration(expectedVaultGeneration, operation, ownerToken);
    const activeVault = {...storedTemporary};
    delete activeVault.pendingWrite;
    preserveVerifiedTemporary = true;
    localStorage.setItem(V2_VAULT_KEY, JSON.stringify(activeVault));
    preserveVerifiedTemporary = false;
    localStorage.removeItem(V2_TEMP_VAULT_KEY);
    return {meta:metaFromVault(activeVault), vaultGeneration};
  } catch (error) {
    if (!preserveVerifiedTemporary) removeOwnedTemporary(ownerToken);
    throw error;
  } finally {
    releaseWriteLease(ownerToken);
  }
}

function metaFromVault(vault) {
  return {
    createdAt:vault.createdAt,
    iterations:vault.kdf.iterations,
    salt:base64ToBytes(vault.kdf.salt),
    vaultGeneration:generationFromEnvelope(vault)
  };
}

function assertSupportedVault(vault) {
  if (!vault || ![1,2].includes(vault.version) || vault.cipher?.name!=='AES-GCM' || vault.kdf?.name!=='PBKDF2') {
    throw new Error('Unsupported backup format.');
  }
}

export async function createVault(state,passphrase,options = {}) {
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await deriveKey(passphrase,salt);
  const meta={createdAt:new Date().toISOString(),iterations:KDF_ITERATIONS,salt};
  if (localStorage.getItem(V2_VAULT_KEY) !== null || localStorage.getItem(V2_TEMP_VAULT_KEY) !== null) {
    throw new VaultConflictError('create');
  }
  const expectedVaultGeneration = await currentGenerationForWrite(NO_VAULT_GENERATION);
  const vault=await encryptState(state,key,meta);
  const written = await writeCoordinated(vault,key,{...options, expectedVaultGeneration, operation:'create'});
  return {state,key,meta:written.meta,vaultGeneration:written.vaultGeneration,sourceStorageKey:V2_VAULT_KEY,needsVaultMigration:false};
}

export async function unlock(passphrase) {
  const record=readVaultRecord();
  if (!record) throw new Error('No encrypted vault exists.');
  assertSupportedVault(record.vault);
  const vaultGeneration=await generationForRecord(record);
  const meta={...metaFromVault(record.vault), vaultGeneration};
  const key=await deriveKey(passphrase,meta.salt,meta.iterations);
  const state=await decryptState(record.vault,key);
  const needsVaultMigration=record.isLegacy || record.isTemporary || record.vault.version !== 2 || record.vault.product !== PRODUCT_NAME;
  return {state,key,meta,vaultGeneration,sourceStorageKey:record.storageKey,needsVaultMigration};
}

export async function saveVault(state,key,meta,{expectedVaultGeneration = meta?.vaultGeneration, ...options} = {}) {
  assertVaultGeneration(expectedVaultGeneration);
  const vault=await encryptState(state,key,meta);
  return writeCoordinated(vault,key,{...options, expectedVaultGeneration, operation:'save'});
}

export async function changePassphrase(state,currentPassphrase,newPassphrase,{expectedVaultGeneration, ...options} = {}) {
  assertVaultGeneration(expectedVaultGeneration);
  await assertExpectedGeneration(expectedVaultGeneration, 'change-passphrase');
  const currentRecord=readVaultRecord();
  if (!currentRecord) throw new Error('No vault found.');
  assertSupportedVault(currentRecord.vault);
  const currentMeta=metaFromVault(currentRecord.vault);
  const currentKey=await deriveKey(currentPassphrase,currentMeta.salt,currentMeta.iterations);
  await decryptState(currentRecord.vault,currentKey);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await deriveKey(newPassphrase,salt);
  const meta={createdAt:currentRecord.vault.createdAt,iterations:KDF_ITERATIONS,salt};
  const next=await encryptState(state,key,meta);
  const written=await writeCoordinated(next,key,{...options, expectedVaultGeneration, operation:'change-passphrase'});
  return {key,meta:written.meta,vaultGeneration:written.vaultGeneration};
}

export function exportEncryptedBackup() {
  const record=readVaultRecord();
  if (!record) throw new Error('No vault found.');
  return record.raw;
}

export async function verifyBackup(raw,passphrase) {
  const vault=JSON.parse(raw);
  assertSupportedVault(vault);
  const vaultGeneration=await generationForRecord({vault,raw});
  const meta={...metaFromVault(vault), vaultGeneration};
  const key=await deriveKey(passphrase,meta.salt,meta.iterations);
  const state=await decryptState(vault,key);
  return {vault,state,key,meta,vaultGeneration,needsVaultMigration:vault.version !== 2 || vault.product !== PRODUCT_NAME};
}

export function clearVault() {
  localStorage.removeItem(V2_VAULT_KEY);
  localStorage.removeItem(V2_TEMP_VAULT_KEY);
  localStorage.removeItem(V2_VAULT_WRITE_LEASE_KEY);
  // Never delete V1 keys here. A V2 reset must not erase a recoverable V1 vault.
}

export const vaultConstants={
  VAULT_KEY:V2_VAULT_KEY,
  TEMP_KEY:V2_TEMP_VAULT_KEY,
  WRITE_LEASE_KEY:V2_VAULT_WRITE_LEASE_KEY,
  LEGACY_VAULT_KEY:V1_VAULT_KEY,
  LEGACY_TEMP_KEY:V1_TEMP_VAULT_KEY,
  LEGACY_STATE_KEY:V1_LEGACY_STATE_KEY,
  KDF_ITERATIONS,
  WRITE_LEASE_MS,
  NO_VAULT_GENERATION
};
