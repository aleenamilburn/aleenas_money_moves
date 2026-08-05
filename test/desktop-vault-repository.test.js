import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {DESKTOP_VAULT_MAX_BYTES, LocalVaultRepository, NO_VAULT_GENERATION} from '../electron/localVaultRepository.js';
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

function injected(code = 'EIO') {
  return () => { throw Object.assign(new Error('injected filesystem failure'), {code}); };
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

test('overlapping saves serialize locally and an external active replacement is not overwritten', async t => {
  const {baseDirectory, repository} = await temporaryRepository();
  t.after(() => fs.rm(baseDirectory, {recursive:true, force:true}));
  const first = envelope(1);
  await repository.create(first);
  const [left, right] = await Promise.allSettled([
    repository.save(envelope(2), {expectedVaultGeneration:first.vaultGeneration}),
    repository.save(envelope(3), {expectedVaultGeneration:first.vaultGeneration})
  ]);
  assert.equal([left, right].filter(result => result.status === 'fulfilled').length, 1);
  assert.equal([left, right].filter(result => result.status === 'rejected' && result.reason.code === 'VAULT_CONFLICT').length, 1);

  const active = (await repository.load()).encryptedEnvelope;
  const external = envelope(4);
  const guarded = new LocalVaultRepository({
    baseDirectory,
    hooks:{beforePromotion:async () => fs.writeFile(repository.layout.active, JSON.stringify(external), {mode:0o600})}
  });
  await assert.rejects(
    guarded.save(envelope(5), {expectedVaultGeneration:active.vaultGeneration}),
    error => error.code === 'VAULT_CONFLICT'
  );
  assert.deepEqual((await guarded.load()).encryptedEnvelope, external);
});

test('deterministic pending-write, flush, verification, rotation, rename, and permission failures preserve active data', async t => {
  const cases = [
    ['write', {beforeWrite:stage => stage === 'pending' ? injected()() : undefined}, 'FILE_WRITE_FAILED'],
    ['flush', {beforeFlush:stage => stage === 'pending' ? injected()() : undefined}, 'FILE_WRITE_FAILED'],
    ['verification', {beforeVerification:stage => stage === 'pending' ? injected()() : undefined}, 'FILE_WRITE_FAILED'],
    ['rotation', {beforeRotation:injected()}, 'FILE_WRITE_FAILED'],
    ['rename', {beforeRename:injected()}, 'FILE_WRITE_FAILED'],
    ['permission', {beforeWrite:stage => stage === 'pending' ? injected('EACCES')() : undefined}, 'FILE_PERMISSION_DENIED'],
    ['disk-full', {beforeWrite:stage => stage === 'pending' ? injected('ENOSPC')() : undefined}, 'FILE_WRITE_FAILED'],
    ['pending-directory-sync', {beforeDirectorySync:stage => stage === 'pending' ? injected()() : undefined}, 'FILE_WRITE_FAILED']
  ];
  for (const [label, hooks, expectedCode] of cases) {
    await t.test(label, async t => {
      const {baseDirectory, repository:seeded} = await temporaryRepository();
      t.after(() => fs.rm(baseDirectory, {recursive:true, force:true}));
      const stable = envelope(1);
      await seeded.create(stable);
      const repository = new LocalVaultRepository({baseDirectory, hooks});
      await assert.rejects(repository.save(envelope(2), {expectedVaultGeneration:stable.vaultGeneration}), error => error.code === expectedCode);
      assert.deepEqual((await repository.load()).encryptedEnvelope, stable);
    });
  }
});

test('a durability failure after rename reports failure without rolling active data back', async t => {
  const {baseDirectory, repository:seeded} = await temporaryRepository();
  t.after(() => fs.rm(baseDirectory, {recursive:true, force:true}));
  const stable = envelope(1);
  const promoted = envelope(2);
  await seeded.create(stable);
  const repository = new LocalVaultRepository({baseDirectory, hooks:{beforeDirectorySync:stage => stage === 'active' ? injected()() : undefined}});
  await assert.rejects(repository.save(promoted, {expectedVaultGeneration:stable.vaultGeneration}), error => error.code === 'FILE_WRITE_FAILED');
  assert.deepEqual((await repository.load()).encryptedEnvelope, promoted);
  assert.deepEqual(JSON.parse(await fs.readFile(repository.layout.previous, 'utf8')), stable);
});

test('symlink substitution cannot be followed for vault files, import, or export', async t => {
  const {baseDirectory, repository:seeded} = await temporaryRepository();
  t.after(() => fs.rm(baseDirectory, {recursive:true, force:true}));
  const stable = envelope(1);
  await seeded.create(stable);
  const outside = path.join(baseDirectory, 'outside.mmvault');
  const outsideRaw = JSON.stringify(envelope(9));
  await fs.writeFile(outside, outsideRaw, {mode:0o600});
  const repository = new LocalVaultRepository({
    baseDirectory,
    hooks:{beforeWrite:async stage => {
      if (stage === 'pending') await fs.symlink(outside, seeded.layout.pending);
    }}
  });
  await assert.rejects(repository.save(envelope(2), {expectedVaultGeneration:stable.vaultGeneration}), error => error.code === 'FILE_WRITE_FAILED');
  assert.equal(await fs.readFile(outside, 'utf8'), outsideRaw);
  assert.deepEqual((await repository.load()).encryptedEnvelope, stable);

  const importedLink = path.join(baseDirectory, 'linked.mmvault');
  await fs.symlink(outside, importedLink);
  await assert.rejects(repository.importFrom(importedLink), error => error.code === 'INVALID_BACKUP');

  await fs.rm(seeded.layout.active);
  await fs.symlink(outside, seeded.layout.active);
  await assert.rejects(repository.load(), error => error.code === 'VAULT_CORRUPT');
});

test('malformed, oversized, and recovery-evidence files never become automatic authority', async t => {
  const {baseDirectory, repository} = await temporaryRepository();
  t.after(() => fs.rm(baseDirectory, {recursive:true, force:true}));
  await fs.mkdir(repository.layout.directory, {recursive:true, mode:0o700});
  await fs.writeFile(repository.layout.previous, JSON.stringify(envelope(1)), {mode:0o600});
  await fs.writeFile(repository.layout.pending, '{interrupted', {mode:0o600});
  assert.deepEqual(await repository.load(), {encryptedEnvelope:null, vaultGeneration:NO_VAULT_GENERATION, recovery:'RECOVERY_REQUIRED'});
  assert.equal((await repository.inspect()).recoveryRequired, true);

  await fs.writeFile(repository.layout.active, '{corrupt active', {mode:0o600});
  await assert.rejects(repository.inspect(), error => error.code === 'VAULT_CORRUPT');
  await assert.rejects(repository.load(), error => error.code === 'VAULT_CORRUPT');

  await fs.writeFile(repository.layout.active, 'x'.repeat(DESKTOP_VAULT_MAX_BYTES + 1), {mode:0o600});
  await assert.rejects(repository.load(), error => error.code === 'FILE_TOO_LARGE');
  await assert.rejects(repository.create({...envelope(2), unexpected:true}), error => error.code === 'INVALID_VAULT_ENVELOPE');
});

test('interrupted recovery can be repeated and successful restore keeps exact backup bytes separate from the new authority', async t => {
  const {baseDirectory, repository:seeded} = await temporaryRepository();
  t.after(() => fs.rm(baseDirectory, {recursive:true, force:true}));
  await fs.mkdir(seeded.layout.directory, {recursive:true, mode:0o700});
  const prior = envelope(1);
  await fs.writeFile(seeded.layout.previous, JSON.stringify(prior), {mode:0o600});
  const replacement = envelope(2);
  const interrupted = new LocalVaultRepository({baseDirectory, hooks:{beforePromotion:injected()}});
  await assert.rejects(interrupted.restore(replacement, {expectedVaultGeneration:NO_VAULT_GENERATION}), error => error.code === 'FILE_WRITE_FAILED');
  assert.deepEqual(await interrupted.load(), {encryptedEnvelope:null, vaultGeneration:NO_VAULT_GENERATION, recovery:'RECOVERY_REQUIRED'});

  const recovered = new LocalVaultRepository({baseDirectory});
  assert.equal((await recovered.restore(replacement, {expectedVaultGeneration:NO_VAULT_GENERATION})).vaultGeneration, replacement.vaultGeneration);
  assert.deepEqual((await recovered.load()).encryptedEnvelope, replacement);
  assert.deepEqual(JSON.parse(await fs.readFile(recovered.layout.previous, 'utf8')), prior);
});

test('encrypted backup export is exact, ciphertext-only at the boundary, and does not mutate the vault', async t => {
  const {baseDirectory, repository} = await temporaryRepository();
  t.after(() => fs.rm(baseDirectory, {recursive:true, force:true}));
  const active = envelope(1);
  await repository.create(active);
  const raw = await fs.readFile(repository.layout.active, 'utf8');
  const target = path.join(baseDirectory, 'synthetic-export.mmvault');
  await repository.exportTo(target);
  assert.equal(await fs.readFile(target, 'utf8'), raw);
  assert.equal((await repository.load()).vaultGeneration, active.vaultGeneration);
  assert.equal((await fs.stat(target)).mode & 0o777, 0o600);
});
