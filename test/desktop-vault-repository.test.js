import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {LocalVaultRepository, NO_VAULT_GENERATION} from '../electron/localVaultRepository.js';
import {createLegacyV1Envelope} from './helpers.js';
import {deriveDesktopVaultKey} from '../js/services/desktopVaultRepository.js';

function generation(number) {
  return `mmvg:00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
}

function envelope(number, sequence = number) {
  return {
    version:2,
    product:'Money Moves',
    schemaVersion:7,
    createdAt:'2026-08-05T00:00:00.000Z',
    updatedAt:'2026-08-05T00:00:00.000Z',
    kdf:{name:'PBKDF2', hash:'SHA-256', iterations:600000, salt:'c2FsdA=='},
    cipher:{name:'AES-GCM', iv:'aXY=', aad:`Money Moves Vault v2|generation:${generation(number)}|sequence:${sequence}`, binding:'generation-v1', ciphertext:'Y2lwaGVydGV4dA=='},
    vaultGeneration:generation(number),
    vaultSequence:sequence
  };
}

async function temporaryRepository(options = {}) {
  const baseDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'money-moves-desktop-vault-'));
  return {baseDirectory, repository:new LocalVaultRepository({baseDirectory, ...options})};
}

test('local vault repository creates, verifies, promotes, rotates, and advances generations', async t => {
  const {baseDirectory, repository} = await temporaryRepository();
  t.after(() => fs.rm(baseDirectory, {recursive:true, force:true}));
  const first = envelope(1);
  const second = envelope(2);

  assert.deepEqual(await repository.inspect(), {exists:false, vaultGeneration:NO_VAULT_GENERATION, pendingPresent:false, previousPresent:false, recoveryRequired:false});
  assert.equal((await repository.create(first)).vaultGeneration, first.vaultGeneration);
  assert.equal((await repository.load()).vaultGeneration, first.vaultGeneration);
  assert.equal((await repository.save(second, {expectedVaultGeneration:first.vaultGeneration})).vaultGeneration, second.vaultGeneration);
  assert.equal((await repository.load()).vaultGeneration, second.vaultGeneration);
  assert.deepEqual(JSON.parse(await fs.readFile(repository.layout.previous, 'utf8')), first);
  assert.equal((await fs.stat(repository.layout.active)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(repository.layout.directory)).mode & 0o777, 0o700);
  await assert.rejects(repository.save(envelope(3), {expectedVaultGeneration:first.vaultGeneration}), error => error.code === 'VAULT_CONFLICT');
});

test('a failed promotion leaves the authoritative active envelope usable and keeps pending only as evidence', async t => {
  const {baseDirectory} = await temporaryRepository();
  t.after(() => fs.rm(baseDirectory, {recursive:true, force:true}));
  const stable = envelope(1);
  const seeded = new LocalVaultRepository({baseDirectory});
  await seeded.create(stable);
  const repository = new LocalVaultRepository({baseDirectory, hooks:{beforePromotion:async () => { throw new Error('injected interruption'); }}});

  await assert.rejects(repository.save(envelope(2), {expectedVaultGeneration:stable.vaultGeneration}), error => error.code === 'FILE_WRITE_FAILED');
  assert.deepEqual((await repository.load()).encryptedEnvelope, stable);
  assert.equal((await repository.inspect()).pendingPresent, true);
});

test('valid active remains authoritative over valid or malformed pending evidence', async t => {
  const {baseDirectory, repository} = await temporaryRepository();
  t.after(() => fs.rm(baseDirectory, {recursive:true, force:true}));
  const active = envelope(1);
  await repository.create(active);
  await fs.writeFile(repository.layout.pending, JSON.stringify(envelope(2)), {mode:0o600});
  assert.equal((await repository.load()).vaultGeneration, active.vaultGeneration);
  await fs.writeFile(repository.layout.pending, '{truncated', {mode:0o600});
  const inspected = await repository.inspect();
  assert.equal(inspected.exists, true);
  assert.equal(inspected.pendingPresent, true);
  assert.equal((await repository.load()).vaultGeneration, active.vaultGeneration);
});

test('previous evidence is never silently promoted when active is absent', async t => {
  const {baseDirectory, repository} = await temporaryRepository();
  t.after(() => fs.rm(baseDirectory, {recursive:true, force:true}));
  await fs.mkdir(repository.layout.directory, {recursive:true, mode:0o700});
  await fs.writeFile(repository.layout.previous, JSON.stringify(envelope(1)), {mode:0o600});

  assert.deepEqual(await repository.load(), {encryptedEnvelope:null, vaultGeneration:NO_VAULT_GENERATION, recovery:'RECOVERY_REQUIRED'});
  assert.equal((await repository.inspect()).recoveryRequired, true);
  const restored = envelope(2);
  assert.equal((await repository.restore(restored, {expectedVaultGeneration:NO_VAULT_GENERATION})).vaultGeneration, restored.vaultGeneration);
  assert.equal((await repository.load()).vaultGeneration, restored.vaultGeneration);
});

test('backup import rejects an unsafe path and accepts only an encrypted .mmvault file', async t => {
  const {baseDirectory, repository} = await temporaryRepository();
  t.after(() => fs.rm(baseDirectory, {recursive:true, force:true}));
  const valid = path.join(baseDirectory, 'synthetic.mmvault');
  await fs.writeFile(valid, JSON.stringify(envelope(1)), {mode:0o600});
  assert.equal((await repository.importFrom(valid)).vaultGeneration, generation(1));
  const legacy = path.join(baseDirectory, 'legacy.mmvault');
  await fs.writeFile(legacy, await createLegacyV1Envelope({schemaVersion:1}, 'legacy desktop import passphrase', deriveDesktopVaultKey), {mode:0o600});
  assert.equal((await repository.importFrom(legacy)).version, 1);
  await assert.rejects(repository.importFrom(path.join(baseDirectory, 'synthetic.json')), error => error.code === 'INVALID_BACKUP');
});
