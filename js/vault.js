import {
  PRODUCT_NAME,
  V1_LEGACY_STATE_KEY,
  V1_TEMP_VAULT_KEY,
  V1_VAULT_AAD,
  V1_VAULT_KEY,
  V2_TEMP_VAULT_KEY,
  V2_VAULT_AAD,
  V2_VAULT_KEY
} from './domain/constants.js';

const KDF_ITERATIONS = 600000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

async function encryptState(state,key,meta) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt(
    {name:'AES-GCM',iv,additionalData:encoder.encode(V2_VAULT_AAD)},
    key,encoder.encode(JSON.stringify(state))
  );
  return {
    version:2,
    product:PRODUCT_NAME,
    schemaVersion:Number(state?.schemaVersion || 0),
    createdAt:meta.createdAt || new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    kdf:{name:'PBKDF2',hash:'SHA-256',iterations:meta.iterations||KDF_ITERATIONS,salt:bytesToBase64(meta.salt)},
    cipher:{name:'AES-GCM',iv:bytesToBase64(iv),aad:V2_VAULT_AAD,ciphertext:bytesToBase64(new Uint8Array(ciphertext))}
  };
}

async function decryptState(vault,key) {
  const plain=await crypto.subtle.decrypt(
    {name:'AES-GCM',iv:base64ToBytes(vault.cipher.iv),additionalData:encoder.encode(aadForVault(vault))},
    key,base64ToBytes(vault.cipher.ciphertext)
  );
  return JSON.parse(decoder.decode(plain));
}

async function writeAtomic(vault,key) {
  const serialized=JSON.stringify(vault);
  localStorage.setItem(V2_TEMP_VAULT_KEY,serialized);
  await decryptState(JSON.parse(localStorage.getItem(V2_TEMP_VAULT_KEY)),key);
  localStorage.setItem(V2_VAULT_KEY,serialized);
  localStorage.removeItem(V2_TEMP_VAULT_KEY);
}

function metaFromVault(vault) {
  return {
    createdAt:vault.createdAt,
    iterations:vault.kdf.iterations,
    salt:base64ToBytes(vault.kdf.salt)
  };
}

function assertSupportedVault(vault) {
  if (!vault || ![1,2].includes(vault.version) || vault.cipher?.name!=='AES-GCM' || vault.kdf?.name!=='PBKDF2') {
    throw new Error('Unsupported backup format.');
  }
}

export async function createVault(state,passphrase) {
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await deriveKey(passphrase,salt);
  const meta={createdAt:new Date().toISOString(),iterations:KDF_ITERATIONS,salt};
  const vault=await encryptState(state,key,meta);
  await writeAtomic(vault,key);
  return {state,key,meta,sourceStorageKey:V2_VAULT_KEY,needsVaultMigration:false};
}

export async function unlock(passphrase) {
  const record=readVaultRecord();
  if (!record) throw new Error('No encrypted vault exists.');
  assertSupportedVault(record.vault);
  const meta=metaFromVault(record.vault);
  const key=await deriveKey(passphrase,meta.salt,meta.iterations);
  const state=await decryptState(record.vault,key);
  const needsVaultMigration=record.isLegacy || record.isTemporary || record.vault.version !== 2 || record.vault.product !== PRODUCT_NAME;
  return {state,key,meta,sourceStorageKey:record.storageKey,needsVaultMigration};
}

export async function saveVault(state,key,meta) {
  const vault=await encryptState(state,key,meta);
  await writeAtomic(vault,key);
  return metaFromVault(vault);
}

export async function changePassphrase(state,currentPassphrase,newPassphrase) {
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
  await writeAtomic(next,key);
  return {key,meta};
}

export function exportEncryptedBackup() {
  const record=readVaultRecord();
  if (!record) throw new Error('No vault found.');
  return record.raw;
}

export async function verifyBackup(raw,passphrase) {
  const vault=JSON.parse(raw);
  assertSupportedVault(vault);
  const meta=metaFromVault(vault);
  const key=await deriveKey(passphrase,meta.salt,meta.iterations);
  const state=await decryptState(vault,key);
  return {vault,state,key,meta,needsVaultMigration:vault.version !== 2 || vault.product !== PRODUCT_NAME};
}

export function clearVault() {
  localStorage.removeItem(V2_VAULT_KEY);
  localStorage.removeItem(V2_TEMP_VAULT_KEY);
  // Never delete V1 keys here. A V2 reset must not erase a recoverable V1 vault.
}

export const vaultConstants={
  VAULT_KEY:V2_VAULT_KEY,
  TEMP_KEY:V2_TEMP_VAULT_KEY,
  LEGACY_VAULT_KEY:V1_VAULT_KEY,
  LEGACY_TEMP_KEY:V1_TEMP_VAULT_KEY,
  LEGACY_STATE_KEY:V1_LEGACY_STATE_KEY,
  KDF_ITERATIONS
};
