import {constants as fsConstants} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export const DESKTOP_VAULT_MAX_BYTES = 16 * 1024 * 1024;
export const NO_VAULT_GENERATION = 'mmvg:none';

const GENERATION_PATTERN = /^mmvg:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILES = Object.freeze({
  active:'active.mmvault',
  previous:'previous.mmvault',
  previousStaging:'previous.staging.mmvault',
  pending:'pending.mmvault'
});

export class DesktopVaultError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DesktopVaultError';
    this.code = code;
  }
}

function error(code, message) {
  return new DesktopVaultError(code, message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && value.length <= 64 && !Number.isNaN(Date.parse(value));
}

function isBase64(value, maximumLength = DESKTOP_VAULT_MAX_BYTES * 2) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximumLength && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function assertOnlyFields(value, fields) {
  for (const key of Object.keys(value)) if (!fields.has(key)) throw error('INVALID_VAULT_ENVELOPE', 'The encrypted vault envelope is not valid.');
}

// The main process validates only public envelope structure. It never decrypts or
// interprets financial state; AES-GCM authentication remains renderer-owned.
export function validateEncryptedEnvelope(envelope, {allowLegacy = false} = {}) {
  if (!isPlainObject(envelope)) throw error('INVALID_VAULT_ENVELOPE', 'The encrypted vault envelope is not valid.');
  const version = envelope.version;
  if (version !== 2 && !(allowLegacy && version === 1)) throw error('INVALID_VAULT_ENVELOPE', 'The encrypted vault envelope is not valid.');
  assertOnlyFields(envelope, new Set(version === 1
    ? ['version', 'product', 'schemaVersion', 'createdAt', 'updatedAt', 'kdf', 'cipher']
    : ['version', 'product', 'schemaVersion', 'createdAt', 'updatedAt', 'kdf', 'cipher', 'vaultGeneration', 'vaultSequence']));
  if (typeof envelope.product !== 'string' || envelope.product.length < 1 || envelope.product.length > 80 ||
    (version === 2 && (!Number.isSafeInteger(envelope.schemaVersion) || envelope.schemaVersion < 0)) ||
    (version === 1 && envelope.schemaVersion !== undefined && (!Number.isSafeInteger(envelope.schemaVersion) || envelope.schemaVersion < 0)) ||
    !isIsoTimestamp(envelope.createdAt) || !isIsoTimestamp(envelope.updatedAt) ||
    !isPlainObject(envelope.kdf) || !isPlainObject(envelope.cipher)) {
    throw error('INVALID_VAULT_ENVELOPE', 'The encrypted vault envelope is not valid.');
  }
  assertOnlyFields(envelope.kdf, new Set(['name', 'hash', 'iterations', 'salt']));
  assertOnlyFields(envelope.cipher, new Set(version === 1
    ? ['name', 'iv', 'aad', 'ciphertext']
    : ['name', 'iv', 'aad', 'binding', 'ciphertext']));
  if (envelope.kdf.name !== 'PBKDF2' || envelope.kdf.hash !== 'SHA-256' || !Number.isSafeInteger(envelope.kdf.iterations) ||
    envelope.kdf.iterations < 100000 || envelope.kdf.iterations > 2000000 || !isBase64(envelope.kdf.salt, 1024) ||
    envelope.cipher.name !== 'AES-GCM' || !isBase64(envelope.cipher.iv, 1024) || typeof envelope.cipher.aad !== 'string' ||
    envelope.cipher.aad.length > 512 || !isBase64(envelope.cipher.ciphertext)) {
    throw error('INVALID_VAULT_ENVELOPE', 'The encrypted vault envelope is not valid.');
  }
  if (version === 2 && (envelope.cipher.binding !== 'generation-v1' || !GENERATION_PATTERN.test(envelope.vaultGeneration || '') ||
    !Number.isSafeInteger(envelope.vaultSequence) || envelope.vaultSequence < 1)) {
    throw error('INVALID_VAULT_ENVELOPE', 'The encrypted vault envelope is not valid.');
  }
  const serialized = JSON.stringify(envelope);
  if (Buffer.byteLength(serialized, 'utf8') > DESKTOP_VAULT_MAX_BYTES) throw error('FILE_TOO_LARGE', 'The encrypted vault file is too large.');
  return serialized;
}

function mapFileError(cause, operation) {
  if (cause instanceof DesktopVaultError) return cause;
  if (cause?.code === 'ENOENT') return error('VAULT_NOT_FOUND', 'The encrypted vault was not found.');
  if (cause?.code === 'EACCES' || cause?.code === 'EPERM') return error('FILE_PERMISSION_DENIED', 'Money Moves does not have permission to access the encrypted vault.');
  if (cause?.code === 'ENOSPC') return error('FILE_WRITE_FAILED', 'Money Moves could not save the encrypted vault.');
  return error(operation === 'read' ? 'FILE_READ_FAILED' : 'FILE_WRITE_FAILED', operation === 'read'
    ? 'Money Moves could not read the encrypted vault.'
    : 'Money Moves could not save the encrypted vault.');
}

export class LocalVaultRepository {
  #directory;
  #hooks;
  #tail = Promise.resolve();

  constructor({baseDirectory, hooks = {}} = {}) {
    if (typeof baseDirectory !== 'string' || !path.isAbsolute(baseDirectory)) throw new Error('A local vault base directory is required.');
    this.#directory = path.join(baseDirectory, 'vault');
    this.#hooks = hooks;
  }

  get layout() {
    return Object.freeze({directory:this.#directory, active:path.join(this.#directory, FILES.active), previous:path.join(this.#directory, FILES.previous), pending:path.join(this.#directory, FILES.pending)});
  }

  async inspect() {
    await this.#ensureDirectory();
    const active = await this.#readNamed(FILES.active, {missing:null, malformed:'VAULT_CORRUPT'});
    const pending = await this.#inspectEvidence(FILES.pending);
    const previous = await this.#inspectEvidence(FILES.previous);
    if (active) return {exists:true, vaultGeneration:active.envelope.vaultGeneration, pendingPresent:pending.present, previousPresent:previous.present, recoveryRequired:false};
    return {exists:false, vaultGeneration:NO_VAULT_GENERATION, pendingPresent:pending.present, previousPresent:previous.present, recoveryRequired:pending.present || previous.present};
  }

  async load() {
    const active = await this.#readNamed(FILES.active, {missing:null, malformed:'VAULT_CORRUPT'});
    if (!active) return {encryptedEnvelope:null, vaultGeneration:NO_VAULT_GENERATION, recovery:(await this.inspect()).recoveryRequired ? 'RECOVERY_REQUIRED' : null};
    return {encryptedEnvelope:active.envelope, vaultGeneration:active.envelope.vaultGeneration, recovery:null};
  }

  async create(envelope) {
    return this.#withWriteLock(() => this.#replace(envelope, NO_VAULT_GENERATION, {operation:'create'}));
  }

  async save(envelope, {expectedVaultGeneration} = {}) {
    return this.#withWriteLock(() => this.#replace(envelope, expectedVaultGeneration, {operation:'save'}));
  }

  async restore(envelope, {expectedVaultGeneration} = {}) {
    return this.#withWriteLock(() => this.#replace(envelope, expectedVaultGeneration, {operation:'restore'}));
  }

  async exportTo(destination) {
    await this.#assertDialogDestination(destination);
    const active = await this.#readNamed(FILES.active, {missing:null, malformed:'VAULT_CORRUPT'});
    if (!active) throw error('VAULT_NOT_FOUND', 'The encrypted vault was not found.');
    try {
      // Preserve the exact encrypted bytes that were just validated, and create
      // the destination exclusively so a raced symlink can never be followed.
      await this.#writeFreshAndVerify(destination, active.raw, {stage:'export'});
    } catch (cause) {
      if (cause?.code === 'EEXIST') throw error('FILE_WRITE_FAILED', 'A backup file already exists at that location.');
      throw mapFileError(cause, 'write');
    }
    return {exported:true};
  }

  async importFrom(source) {
    if (typeof source !== 'string' || path.extname(source).toLowerCase() !== '.mmvault') throw error('INVALID_BACKUP', 'Choose a Money Moves encrypted backup.');
    try {
      const raw = await this.#readRegularFile(source, {
        invalidCode:'INVALID_BACKUP',
        invalidMessage:'Choose a Money Moves encrypted backup.'
      });
      const envelope = JSON.parse(raw);
      validateEncryptedEnvelope(envelope, {allowLegacy:true});
      return envelope;
    } catch (cause) {
      if (cause instanceof DesktopVaultError) throw cause;
      // A file can disappear after the user has selected it in the native panel.
      // That is a selected-backup read failure, not an absent active vault.
      if (cause?.code === 'ENOENT') throw error('FILE_READ_FAILED', 'Money Moves could not read the selected backup.');
      if (cause instanceof SyntaxError) throw error('INVALID_BACKUP', 'The selected file is not a valid Money Moves encrypted backup.');
      throw mapFileError(cause, 'read');
    }
  }

  async #replace(envelope, expectedVaultGeneration, {operation}) {
    if (typeof expectedVaultGeneration !== 'string') throw error('INVALID_VAULT_ENVELOPE', 'The encrypted vault request is not valid.');
    const serialized = validateEncryptedEnvelope(envelope);
    await this.#ensureDirectory();
    const active = await this.#readNamed(FILES.active, {missing:null, malformed:'VAULT_CORRUPT'});
    if (operation === 'create' && active) throw error('VAULT_ALREADY_EXISTS', 'An encrypted vault already exists on this device.');
    const actualGeneration = active?.envelope.vaultGeneration || NO_VAULT_GENERATION;
    if (actualGeneration !== expectedVaultGeneration) throw error('VAULT_CONFLICT', 'The encrypted vault changed before it could be saved.');
    if (operation !== 'create' && !active && expectedVaultGeneration !== NO_VAULT_GENERATION) throw error('VAULT_CONFLICT', 'The encrypted vault changed before it could be saved.');

    const pendingPath = this.layout.pending;
    try {
      // A pending file with a valid active file is recovery evidence only, never
      // authority. It is safe to clear before starting a new replacement.
      await fs.rm(pendingPath, {force:true});
      await this.#writeFreshAndVerify(pendingPath, serialized, {stage:'pending'});
      await this.#syncDirectory('pending');

      // An external replacement can occur while the new envelope is being
      // written. Compare both the opaque generation and exact active bytes
      // before rotating or promoting; never overwrite that replacement.
      const beforeRotation = await this.#readNamed(FILES.active, {missing:null, malformed:'VAULT_CORRUPT'});
      this.#assertActiveUnchanged(beforeRotation, active, expectedVaultGeneration);
      if (beforeRotation) await this.#preservePrevious(beforeRotation.raw);
      await this.#hooks.beforePromotion?.();

      // Repeat the check after prior-vault rotation. This closes the normal
      // check-then-promote window for competing repository instances and
      // external file replacement while retaining the single-instance lock.
      const beforePromotion = await this.#readNamed(FILES.active, {missing:null, malformed:'VAULT_CORRUPT'});
      this.#assertActiveUnchanged(beforePromotion, active, expectedVaultGeneration);
      await this.#hooks.beforeRename?.();
      await fs.rename(pendingPath, this.layout.active);
      await this.#syncDirectory('active');
      await this.#hooks.afterPromotion?.();
      return {vaultGeneration:envelope.vaultGeneration};
    } catch (cause) {
      throw mapFileError(cause, 'write');
    }
  }

  #assertActiveUnchanged(current, original, expectedVaultGeneration) {
    const generation = current?.envelope.vaultGeneration || NO_VAULT_GENERATION;
    if (generation !== expectedVaultGeneration || Boolean(current) !== Boolean(original) || (current && current.raw !== original.raw)) {
      throw error('VAULT_CONFLICT', 'The encrypted vault changed before it could be saved.');
    }
  }

  async #preservePrevious(raw) {
    const stagingPath = path.join(this.#directory, FILES.previousStaging);
    const previousPath = this.layout.previous;
    try {
      await fs.rm(stagingPath, {force:true});
      await this.#hooks.beforeRotation?.();
      await this.#writeFreshAndVerify(stagingPath, raw, {stage:'previous'});
      await fs.rename(stagingPath, previousPath);
      await this.#syncDirectory('previous');
    } finally {
      // A failed rotation must leave the active vault authoritative. Staging is
      // ciphertext only, and is removed when possible so it cannot be mistaken
      // for recovery evidence on a later launch.
      await fs.rm(stagingPath, {force:true}).catch(() => {});
    }
  }

  async #writeFreshAndVerify(target, serialized, {stage}) {
    let handle;
    try {
      await this.#hooks.beforeWrite?.(stage);
      handle = await fs.open(target, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
      await handle.writeFile(serialized, 'utf8');
      await this.#hooks.beforeFlush?.(stage);
      await handle.sync();
    } finally {
      await handle?.close();
    }
    await fs.chmod(target, 0o600);
    await this.#hooks.beforeVerification?.(stage);
    const verified = await this.#readRegularFile(target, {
      invalidCode:'FILE_WRITE_FAILED',
      invalidMessage:'Money Moves could not verify the encrypted vault save.'
    });
    if (verified !== serialized) throw error('FILE_WRITE_FAILED', 'Money Moves could not verify the encrypted vault save.');
  }

  async #readNamed(name, {missing, malformed}) {
    const target = path.join(this.#directory, name);
    try {
      const raw = await this.#readRegularFile(target, {
        invalidCode:malformed,
        invalidMessage:'The encrypted vault could not be verified.'
      });
      const envelope = JSON.parse(raw);
      validateEncryptedEnvelope(envelope);
      return {raw, envelope};
    } catch (cause) {
      if (cause?.code === 'ENOENT') return missing;
      if (cause instanceof DesktopVaultError) throw cause;
      if (cause instanceof SyntaxError) throw error(malformed, 'The encrypted vault could not be verified.');
      throw mapFileError(cause, 'read');
    }
  }

  async #readRegularFile(target, {invalidCode, invalidMessage}) {
    let handle;
    try {
      handle = await fs.open(target, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      const stat = await handle.stat();
      if (!stat.isFile()) throw error(invalidCode, invalidMessage);
      if (stat.size > DESKTOP_VAULT_MAX_BYTES) throw error('FILE_TOO_LARGE', 'The encrypted vault file is too large.');
      return await handle.readFile('utf8');
    } catch (cause) {
      if (cause?.code === 'ELOOP') throw error(invalidCode, invalidMessage);
      throw cause;
    } finally {
      await handle?.close();
    }
  }

  async #inspectEvidence(name) {
    try {
      const record = await this.#readNamed(name, {missing:null, malformed:'INVALID_VAULT_ENVELOPE'});
      return {present:Boolean(record), valid:Boolean(record)};
    } catch (cause) {
      // Pending and previous are never automatic authority. Their malformed shape
      // must not prevent a valid active vault from opening, but remains visible as
      // recovery evidence if active is absent.
      if (cause instanceof DesktopVaultError && ['INVALID_VAULT_ENVELOPE', 'FILE_TOO_LARGE', 'FILE_READ_FAILED'].includes(cause.code)) {
        return {present:true, valid:false};
      }
      throw cause;
    }
  }

  async #assertDialogDestination(destination) {
    if (typeof destination !== 'string' || path.extname(destination).toLowerCase() !== '.mmvault') throw error('INVALID_BACKUP', 'Choose a Money Moves .mmvault backup name.');
    try {
      const stat = await fs.lstat(destination);
      if (stat.isSymbolicLink()) throw error('INVALID_BACKUP', 'Choose a Money Moves .mmvault backup name.');
    } catch (cause) {
      if (cause?.code !== 'ENOENT') throw cause;
    }
  }

  async #ensureDirectory() {
    try {
      await fs.mkdir(this.#directory, {recursive:true, mode:0o700});
      const stat = await fs.lstat(this.#directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw error('FILE_WRITE_FAILED', 'Money Moves could not safely access the encrypted vault directory.');
      await fs.chmod(this.#directory, 0o700);
    } catch (cause) {
      throw mapFileError(cause, 'write');
    }
  }

  async #syncDirectory(stage) {
    let handle;
    try {
      await this.#hooks.beforeDirectorySync?.(stage);
      handle = await fs.open(this.#directory, 'r');
      await handle.sync();
    }
    finally { await handle?.close(); }
  }

  async #withWriteLock(action) {
    const run = this.#tail.catch(() => {}).then(action);
    this.#tail = run;
    return run;
  }
}
