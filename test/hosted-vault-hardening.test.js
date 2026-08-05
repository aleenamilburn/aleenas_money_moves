import assert from 'node:assert/strict';
import test, {beforeEach} from 'node:test';
import {
  changePassphrase, createVault, readVaultRecord, saveVault, unlock,
  VaultIntegrityError
} from '../js/vault.js';
import {createStateService, LocalVaultAdoptionConflictError} from '../js/services/stateService.js';
import {createVaultRepository} from '../js/services/vaultRepository.js';
import {setSupabaseClientForTests} from '../js/services/supabaseClient.js';
import {STATE_SCHEMA_VERSION, V1_VAULT_KEY} from '../js/domain/constants.js';
import {
  createLegacyV1Envelope, currentFakeVaultsTable, installBrowserGlobals,
  legacyV1State, TEST_USER_ID
} from './helpers.js';

const passphrase = 'hosted hardening acceptance passphrase';
const OTHER_USER_ID = 'test-user-2';

function state(overrides = {}) {
  return {
    schemaVersion:7,
    stateRevision:0,
    preferences:{},
    domain:{
      transactions:[], accounts:[], buckets:[], allocations:[],
      reimbursementClaims:[], reimbursementClaimAllocations:[], reimbursementPaymentLinks:[],
      reimbursementAdjustments:[], merchantRules:[], auditEvents:[],
      legacyMonthlySnapshots:[], legacyBalanceSnapshots:[]
    },
    ...overrides
  };
}

beforeEach(() => installBrowserGlobals());

test('the hosted generation and sequence are authenticated encryption context, not mutable envelope hints', async () => {
  const created = await createVault(state({preferences:{secret:'keep private'}}), passphrase);
  const table = currentFakeVaultsTable();
  const row = table.rows.get(TEST_USER_ID);
  row.blob.vaultSequence = 2;

  await assert.rejects(
    () => unlock(passphrase),
    error => error instanceof VaultIntegrityError && error.code === 'VAULT_INTEGRITY_FAILED'
  );

  assert.equal(row.generation, created.vaultGeneration);
  assert.equal(row.blob.cipher.ciphertext.includes('keep private'), false);
});

test('a row whose outer generation differs from its encrypted envelope fails closed before use', async () => {
  await createVault(state(), passphrase);
  const row = currentFakeVaultsTable().rows.get(TEST_USER_ID);
  row.generation = 'mmvg:11111111-1111-4111-8111-111111111111';

  await assert.rejects(
    () => readVaultRecord(),
    error => error instanceof VaultIntegrityError && error.code === 'VAULT_INTEGRITY_FAILED'
  );
});

test('a previously observed newer hosted sequence rejects a replayed older ciphertext', async () => {
  const created = await createVault(state(), passphrase);
  const table = currentFakeVaultsTable();
  const original = structuredClone(table.rows.get(TEST_USER_ID));
  const saved = await saveVault({...created.state, stateRevision:1}, created.key, created.meta, {
    expectedVaultGeneration:created.vaultGeneration
  });
  assert.equal(saved.meta.vaultSequence, 2);

  table.rows.set(TEST_USER_ID, original);
  await assert.rejects(
    () => readVaultRecord(),
    error => error instanceof VaultIntegrityError && error.code === 'VAULT_INTEGRITY_FAILED'
  );
});

test('a malformed successful write acknowledgement is reconciled against the authoritative hosted row', async () => {
  const created = await createVault(state(), passphrase);
  const table = currentFakeVaultsTable();
  setSupabaseClientForTests(table.client(TEST_USER_ID, {failMode:'malformed-response'}));

  const saved = await saveVault({...created.state, stateRevision:1}, created.key, created.meta, {
    expectedVaultGeneration:created.vaultGeneration
  });
  const row = table.rows.get(TEST_USER_ID);
  assert.equal(row.generation, saved.vaultGeneration);
  assert.equal(row.blob.vaultSequence, 2);
});

test('the fake RLS boundary denies cross-user reads, forged ownership, updates, deletes, and future Plaid access', async () => {
  const created = await createVault(state(), passphrase);
  const table = currentFakeVaultsTable();
  const other = table.client(OTHER_USER_ID);

  const read = await other.from('vaults').select('generation, blob').eq('user_id', TEST_USER_ID).maybeSingle();
  assert.equal(read.data, null);

  const forgedInsert = await other.from('vaults').insert({
    user_id:TEST_USER_ID,
    generation:'mmvg:11111111-1111-4111-8111-111111111111',
    blob:structuredClone(table.rows.get(TEST_USER_ID).blob)
  }).select('generation');
  assert.equal(forgedInsert.error.code, '42501');

  const forgedUpdate = await other.from('vaults').update({generation:created.vaultGeneration, blob:{}})
    .eq('user_id', TEST_USER_ID).eq('generation', created.vaultGeneration).select('generation');
  assert.deepEqual(forgedUpdate.data, []);
  assert.equal(table.rows.get(TEST_USER_ID).generation, created.vaultGeneration);

  const forgedDelete = await other.from('vaults').delete().eq('user_id', TEST_USER_ID).select('generation');
  assert.deepEqual(forgedDelete.data, []);
  assert.ok(table.rows.has(TEST_USER_ID));

  const plaidRead = await other.from('plaid_secrets').select('id').eq('user_id', OTHER_USER_ID).maybeSingle();
  const plaidInsert = await other.from('plaid_secrets').insert({user_id:OTHER_USER_ID}).select('id');
  assert.equal(plaidRead.data, null);
  assert.equal(plaidInsert.error.code, '42501');
});

test('passphrase change advances hosted generation and sequence without advancing stateRevision', async () => {
  const created = await createVault(state({stateRevision:7}), passphrase);
  const changed = await changePassphrase(created.state, passphrase, 'a different hosted hardening passphrase', {
    expectedVaultGeneration:created.vaultGeneration
  });
  assert.equal(changed.meta.vaultSequence, 2);
  const reopened = await unlock('a different hosted hardening passphrase');
  assert.equal(reopened.state.stateRevision, 7);
  assert.equal(reopened.meta.vaultSequence, 2);
});

test('restore preserves the backup stateRevision while rebasing on the current hosted sequence', async () => {
  const service = createStateService({repository:createVaultRepository(), seed:state()});
  const created = await service.create(passphrase, state());
  const backup = await service.exportEncryptedBackup();
  const changedState = {...created.state, stateRevision:1, preferences:{newer:'hosted'}};
  const changed = await service.save(changedState, created.key, created.meta, {
    expectedVaultGeneration:created.vaultGeneration
  });
  assert.equal(changed.meta.vaultSequence, 2);

  const restored = await service.restore(backup, passphrase, {expectedVaultGeneration:changed.vaultGeneration});
  assert.equal(restored.state.stateRevision, 0);
  assert.equal(restored.meta.vaultSequence, 3);
});

test('explicit V1 adoption migrates and uploads only when no hosted vault exists, preserving the local record', async () => {
  const legacyRaw = await createLegacyV1Envelope(legacyV1State(), passphrase, (await import('../js/vault.js')).deriveKey);
  localStorage.setItem(V1_VAULT_KEY, legacyRaw);
  const service = createStateService({repository:createVaultRepository()});

  assert.deepEqual(service.localRecoveryStatus(), {encryptedVault:true, encryptedVaultCorrupt:false, legacyState:false});
  const adopted = await service.adoptLocalVault(passphrase);
  assert.equal(adopted.preservedLocalRecovery, true);
  assert.equal(localStorage.getItem(V1_VAULT_KEY), legacyRaw);
  assert.equal((await unlock(passphrase)).state.schemaVersion, STATE_SCHEMA_VERSION);
});

test('explicit V1 adoption refuses to overwrite an existing hosted vault and leaves both records intact', async () => {
  const original = await createVault(state({preferences:{authoritative:'hosted'}}), passphrase);
  const legacyRaw = await createLegacyV1Envelope(legacyV1State(), passphrase, (await import('../js/vault.js')).deriveKey);
  localStorage.setItem(V1_VAULT_KEY, legacyRaw);
  const service = createStateService({repository:createVaultRepository()});

  await assert.rejects(
    () => service.adoptLocalVault(passphrase),
    error => error instanceof LocalVaultAdoptionConflictError && error.code === 'LOCAL_VAULT_ADOPTION_CONFLICT'
  );
  assert.equal(localStorage.getItem(V1_VAULT_KEY), legacyRaw);
  assert.equal((await unlock(passphrase)).state.preferences.authoritative, 'hosted');
  assert.equal((await readVaultRecord()).vault.vaultGeneration, original.vaultGeneration);
});

test('a corrupt local recovery record does not block an existing hosted vault from being opened', async () => {
  await createVault(state({preferences:{authoritative:'hosted'}}), passphrase);
  localStorage.setItem(V1_VAULT_KEY, '{not valid json');
  const service = createStateService({repository:createVaultRepository()});

  assert.deepEqual(service.localRecoveryStatus(), {encryptedVault:false, encryptedVaultCorrupt:true, legacyState:false});
  assert.equal((await service.unlock(passphrase)).state.preferences.authoritative, 'hosted');
  assert.equal(localStorage.getItem(V1_VAULT_KEY), '{not valid json');
});
