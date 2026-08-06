import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import test from 'node:test';
import {createLegacyV1Envelope} from './helpers.js';
import {migrateState} from '../js/domain/migrations.js';
import {createDesktopVaultRepository, deriveDesktopVaultKey} from '../js/services/desktopVaultRepository.js';
import {createStateService} from '../js/services/stateService.js';

function installDesktopBridge() {
  let active = null;
  let importResult = null;
  if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', {value:webcrypto, configurable:true});
  globalThis.btoa = value => Buffer.from(value, 'binary').toString('base64');
  globalThis.atob = value => Buffer.from(value, 'base64').toString('binary');
  globalThis.moneyMovesDesktop = {vault:{
    async inspect() { return {exists:Boolean(active), recoveryRequired:false}; },
    async read() { return {encryptedEnvelope:active, vaultGeneration:active?.vaultGeneration || 'mmvg:none'}; },
    async create(envelope) { if (active) throw Object.assign(new Error('exists'), {code:'VAULT_ALREADY_EXISTS'}); active = structuredClone(envelope); return {vaultGeneration:active.vaultGeneration}; },
    async save(envelope, expectedGeneration) { if (!active || active.vaultGeneration !== expectedGeneration) throw Object.assign(new Error('stale'), {code:'VAULT_CONFLICT'}); active = structuredClone(envelope); return {vaultGeneration:active.vaultGeneration}; },
    async restoreBackup(envelope, expectedGeneration) { if (active || expectedGeneration !== 'mmvg:none') throw Object.assign(new Error('stale'), {code:'VAULT_CONFLICT'}); active = structuredClone(envelope); return {vaultGeneration:active.vaultGeneration}; },
    async exportBackup() { return {cancelled:false}; },
    async importBackup() { return importResult || {status:'selected', encryptedEnvelope:active}; }
  }};
  return {
    active:() => structuredClone(active),
    setImportResult:result => { importResult = result; }
  };
}

const initialState = () => migrateState({
  schemaVersion:7,
  stateRevision:0,
  preferences:{},
  monthly:{selectedMonth:'', activeMonth:'', lastOpenedMonth:''},
  review:{buckets:[], transactions:[], merchantRules:[], importSettings:{}},
  domain:{
    accounts:[], transactions:[], buckets:[], allocations:[], reimbursementClaims:[], reimbursementClaimAllocations:[],
    reimbursementPaymentLinks:[], reimbursementAdjustments:[], merchantRules:[], auditEvents:[], legacyMonthlySnapshots:[], legacyBalanceSnapshots:[]
  }
}, {now:'2026-08-05T12:00:00.000Z'}).state;

test('renderer desktop adapter preserves encrypted-envelope state and generation semantics', async () => {
  installDesktopBridge();
  const repository = createDesktopVaultRepository();
  const passphrase = 'desktop adapter synthetic passphrase';
  const created = await repository.create(initialState(), passphrase);
  const originalGeneration = created.vaultGeneration;
  const unlocked = await repository.unlock(passphrase);
  assert.equal(unlocked.state.stateRevision, 0);
  unlocked.state.stateRevision = 1;
  const saved = await repository.save(unlocked.state, unlocked.key, unlocked.meta, {expectedVaultGeneration:unlocked.vaultGeneration});
  assert.notEqual(saved.vaultGeneration, originalGeneration);
  const changed = await repository.changePassphrase(unlocked.state, passphrase, 'new desktop adapter passphrase', {expectedVaultGeneration:saved.vaultGeneration});
  assert.notEqual(changed.vaultGeneration, saved.vaultGeneration);
  const reopened = await repository.unlock('new desktop adapter passphrase');
  assert.equal(reopened.state.stateRevision, 1);
});

test('desktop adapter verifies a V1 encrypted backup before StateService can migrate and restore it', async () => {
  installDesktopBridge();
  const passphrase = 'v1 desktop migration passphrase';
  const raw = await createLegacyV1Envelope({schemaVersion:1, preferences:{}, review:{buckets:[], transactions:[], merchantRules:[], importSettings:{}}, monthly:{}, providerSnapshot:{}, travel:{visited:[], destinations:[]}, scriptures:[]}, passphrase, deriveDesktopVaultKey);
  const verified = await createDesktopVaultRepository().verifyBackup(raw, passphrase);
  assert.equal(verified.vault.version, 1);
  assert.equal(verified.state.schemaVersion, 1);
});

test('desktop adapter distinguishes cancelled, selected, and malformed native import handoffs', async () => {
  const bridge = installDesktopBridge();
  const repository = createDesktopVaultRepository();
  await repository.create(initialState(), 'desktop adapter import passphrase');

  bridge.setImportResult({status:'cancelled'});
  assert.equal(await repository.importEncryptedBackup(), null);

  bridge.setImportResult({status:'selected', encryptedEnvelope:bridge.active()});
  assert.deepEqual(JSON.parse(await repository.importEncryptedBackup()), bridge.active());

  bridge.setImportResult({cancelled:true});
  await assert.rejects(repository.importEncryptedBackup(), error => error.code === 'PERSISTENCE_FAILED');
  bridge.setImportResult({status:'selected'});
  await assert.rejects(repository.importEncryptedBackup(), error => error.code === 'PERSISTENCE_FAILED');
});

test('verified restore of a copied synthetic backup replaces the active state and survives a fresh repository instance', async () => {
  const bridge = installDesktopBridge();
  const repository = createDesktopVaultRepository();
  const passphrase = 'desktop adapter restore passphrase';
  const alphaState = initialState();
  alphaState.preferences.lockMinutes = 15;
  const alpha = await repository.create(alphaState, passphrase);
  const copiedSyntheticBackup = JSON.stringify(bridge.active());

  const unlocked = await repository.unlock(passphrase);
  unlocked.state.preferences.lockMinutes = 60;
  const beta = await repository.save(unlocked.state, unlocked.key, unlocked.meta, {expectedVaultGeneration:alpha.vaultGeneration});
  const service = createStateService({
    repository,
    seed:initialState(),
    migrate:input => ({state:input, changed:false})
  });
  const beforeWrongPassphrase = bridge.active();
  await assert.rejects(
    service.restore(copiedSyntheticBackup, 'wrong desktop adapter restore passphrase', {expectedVaultGeneration:beta.vaultGeneration}),
    error => error.code === 'INVALID_BACKUP'
  );
  assert.deepEqual(bridge.active(), beforeWrongPassphrase);

  const restored = await service.restore(copiedSyntheticBackup, passphrase, {expectedVaultGeneration:beta.vaultGeneration});
  assert.equal(restored.state.preferences.lockMinutes, 15);
  const relaunched = await createDesktopVaultRepository().unlock(passphrase);
  assert.equal(relaunched.state.preferences.lockMinutes, 15);
});
