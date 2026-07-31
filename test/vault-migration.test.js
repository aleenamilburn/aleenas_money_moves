import assert from 'node:assert/strict';
import test, {beforeEach} from 'node:test';
import {STATE_SCHEMA_VERSION, V1_LEGACY_STATE_KEY, V1_TEMP_VAULT_KEY, V1_VAULT_KEY, V2_TEMP_VAULT_KEY, V2_VAULT_KEY} from '../js/domain/constants.js';
import {createVault, deriveKey, readVaultRecord} from '../js/vault.js';
import {createStateService} from '../js/services/stateService.js';
import {createVaultRepository} from '../js/services/vaultRepository.js';
import {createLegacyV1Envelope, installBrowserGlobals, legacyV1State} from './helpers.js';
import {schema6ReimbursementFixtures} from './fixtures/schema6-reimbursements.js';

beforeEach(() => {
  installBrowserGlobals();
});

function service(seed = legacyV1State()) {
  return createStateService({repository:createVaultRepository(), seed});
}

test('a V1 encrypted vault unlocks, migrates to a Money Moves vault, and keeps the V1 record', async () => {
  const passphrase = 'correct horse battery staple';
  const legacyRaw = await createLegacyV1Envelope(legacyV1State(), passphrase, deriveKey);
  localStorage.setItem(V1_VAULT_KEY, legacyRaw);

  const result = await service().unlock(passphrase);

  assert.equal(result.state.schemaVersion, STATE_SCHEMA_VERSION);
  assert.equal(result.state.app.name, 'Money Moves');
  assert.equal(localStorage.getItem(V1_VAULT_KEY), legacyRaw);
  assert.ok(localStorage.getItem(V2_VAULT_KEY));
  assert.equal(readVaultRecord().isLegacy, false);
});

test('a failed V1-to-V2 restore leaves the active V2 vault untouched', async () => {
  const passphrase = 'correct horse battery staple';
  const stateService = service();
  await stateService.create(passphrase);
  const before = localStorage.getItem(V2_VAULT_KEY);

  const futureState = legacyV1State();
  futureState.schemaVersion = 99;
  const futureBackup = await createLegacyV1Envelope(futureState, passphrase, deriveKey);

  await assert.rejects(() => stateService.restore(futureBackup, passphrase), /newer than supported schema/);
  assert.equal(localStorage.getItem(V2_VAULT_KEY), before);
  assert.equal((await stateService.unlock(passphrase)).state.schemaVersion, STATE_SCHEMA_VERSION);
});

test('clearing the current Money Moves vault does not delete a V1 vault', async () => {
  const passphrase = 'correct horse battery staple';
  const legacyRaw = await createLegacyV1Envelope(legacyV1State(), passphrase, deriveKey);
  localStorage.setItem(V1_VAULT_KEY, legacyRaw);
  const stateService = service();
  await stateService.create(passphrase);

  stateService.clearCurrentVault();

  assert.equal(localStorage.getItem(V2_VAULT_KEY), null);
  assert.equal(localStorage.getItem(V1_VAULT_KEY), legacyRaw);
});

test('a recoverable V1 temporary vault can complete migration when no V1 primary vault exists', async () => {
  const passphrase = 'correct horse battery staple';
  const legacyRaw = await createLegacyV1Envelope(legacyV1State(), passphrase, deriveKey);
  localStorage.setItem(V1_TEMP_VAULT_KEY, legacyRaw);

  const result = await service().unlock(passphrase);

  assert.equal(result.sourceStorageKey, V1_TEMP_VAULT_KEY);
  assert.ok(localStorage.getItem(V2_VAULT_KEY));
  assert.equal(localStorage.getItem(V1_TEMP_VAULT_KEY), legacyRaw);
});

test('legacy plaintext state is migrated into a new V2 vault without deleting its recovery copy', async () => {
  const passphrase = 'correct horse battery staple';
  const legacy = legacyV1State();
  legacy.goals = [{id:'goal-1', name:'Preserve me'}];
  const rawLegacy = JSON.stringify(legacy);
  localStorage.setItem(V1_LEGACY_STATE_KEY, rawLegacy);
  const stateService = service();

  const created = await stateService.create(passphrase, stateService.readLegacyState());

  assert.equal(created.state.app.name, 'Money Moves');
  assert.deepEqual(created.state.goals, legacy.goals);
  assert.equal(localStorage.getItem(V1_LEGACY_STATE_KEY), rawLegacy);
  assert.ok(localStorage.getItem(V2_VAULT_KEY));
});

test('a wrong passphrase does not create or overwrite either V1 or V2 vault state', async () => {
  const passphrase = 'correct horse battery staple';
  const legacyRaw = await createLegacyV1Envelope(legacyV1State(), passphrase, deriveKey);
  localStorage.setItem(V1_VAULT_KEY, legacyRaw);

  await assert.rejects(() => service().unlock('not the correct passphrase'));

  assert.equal(localStorage.getItem(V1_VAULT_KEY), legacyRaw);
  assert.equal(localStorage.getItem(V2_VAULT_KEY), null);

  const stateService = service();
  await stateService.create(passphrase);
  const v2Before = localStorage.getItem(V2_VAULT_KEY);
  await assert.rejects(() => stateService.unlock('still not the correct passphrase'));
  assert.equal(localStorage.getItem(V2_VAULT_KEY), v2Before);
  assert.equal(localStorage.getItem(V1_VAULT_KEY), legacyRaw);
  assert.equal((await stateService.unlock(passphrase)).state.schemaVersion, STATE_SCHEMA_VERSION);
});

test('corrupted ciphertext is rejected without fallback, rewrite, or legacy recovery loss', async () => {
  const passphrase = 'synthetic corrupted ciphertext passphrase';
  const legacyRaw = await createLegacyV1Envelope(legacyV1State(), passphrase, deriveKey);
  localStorage.setItem(V1_VAULT_KEY, legacyRaw);
  await createVault(schema6ReimbursementFixtures.safeSingle(), passphrase);
  const validRaw = localStorage.getItem(V2_VAULT_KEY);
  const corrupted = JSON.parse(validRaw);
  const ciphertext = corrupted.cipher.ciphertext;
  corrupted.cipher.ciphertext = `${ciphertext.slice(0, -2)}${ciphertext.at(-2) === 'A' ? 'B' : 'A'}${ciphertext.at(-1)}`;
  const corruptedRaw = JSON.stringify(corrupted);
  localStorage.setItem(V2_VAULT_KEY, corruptedRaw);

  await assert.rejects(() => service().unlock(passphrase));
  assert.equal(localStorage.getItem(V2_VAULT_KEY), corruptedRaw);
  assert.equal(localStorage.getItem(V1_VAULT_KEY), legacyRaw);

  localStorage.setItem(V2_VAULT_KEY, validRaw);
  assert.equal((await service().unlock(passphrase)).state.schemaVersion, 7);
});

test('a malformed active V2 record never falls back to or overwrites the legacy recovery vault', async () => {
  const passphrase = 'correct horse battery staple';
  const legacyRaw = await createLegacyV1Envelope(legacyV1State(), passphrase, deriveKey);
  const corruptV2 = '{not valid JSON';
  localStorage.setItem(V1_VAULT_KEY, legacyRaw);
  localStorage.setItem(V2_VAULT_KEY, corruptV2);
  const stateService = service();

  assert.equal(stateService.hasVault(), true);
  await assert.rejects(() => stateService.unlock(passphrase), /not valid JSON/);
  assert.equal(localStorage.getItem(V2_VAULT_KEY), corruptV2);
  assert.equal(localStorage.getItem(V1_VAULT_KEY), legacyRaw);
});

test('an interrupted V1-to-V2 write resumes from the verified V2 temporary record', async () => {
  const passphrase = 'correct horse battery staple';
  const legacyRaw = await createLegacyV1Envelope(legacyV1State(), passphrase, deriveKey);
  localStorage.setItem(V1_VAULT_KEY, legacyRaw);
  const storage = localStorage;
  const originalSetItem = storage.setItem.bind(storage);
  let failPermanentWrite = true;
  storage.setItem = (key, value) => {
    if (key === V2_VAULT_KEY && failPermanentWrite) throw new Error('simulated interrupted write');
    return originalSetItem(key, value);
  };

  await assert.rejects(() => service().unlock(passphrase), /simulated interrupted write/);
  assert.equal(localStorage.getItem(V2_VAULT_KEY), null);
  assert.ok(localStorage.getItem(V2_TEMP_VAULT_KEY));
  assert.equal(localStorage.getItem(V1_VAULT_KEY), legacyRaw);

  failPermanentWrite = false;
  const resumed = await service().unlock(passphrase);
  assert.equal(resumed.sourceStorageKey, V2_TEMP_VAULT_KEY);
  assert.equal(readVaultRecord().storageKey, V2_VAULT_KEY);
  assert.equal(localStorage.getItem(V2_TEMP_VAULT_KEY), null);
  assert.equal(localStorage.getItem(V1_VAULT_KEY), legacyRaw);
});

test('an invalid decrypted V2 state is rejected without rewriting the active vault', async () => {
  const passphrase = 'correct horse battery staple';
  const invalid = legacyV1State();
  invalid.schemaVersion = 4;
  invalid.domain = {
    accounts:[],
    transactions:[{
      id:'invalid-transaction', accountId:'missing-account', source:'migration', sourceTransactionId:null,
      rawName:'Invalid', merchantName:null, amountCents:-1, currency:'USD', authorizedAt:null,
      postedAt:null, displayDate:null, pendingStatus:'posted', movementType:'expense', reviewStatus:'pending',
      locationRegion:null, locationCountry:null, locationSource:null, providerCategory:null,
      createdAt:'2026-07-31T00:00:00.000Z', updatedAt:'2026-07-31T00:00:00.000Z'
    }],
    buckets:[], allocations:[], reimbursementClaims:[], merchantRules:[]
  };
  await createVault(invalid, passphrase);
  const before = localStorage.getItem(V2_VAULT_KEY);

  await assert.rejects(() => service().unlock(passphrase), /Pre-migration state failed foundation validation/);
  assert.equal(localStorage.getItem(V2_VAULT_KEY), before);
});

test('state validation rejects an invalid save before it can overwrite the active V2 vault', async () => {
  const passphrase = 'correct horse battery staple';
  const stateService = service();
  const created = await stateService.create(passphrase);
  const before = localStorage.getItem(V2_VAULT_KEY);
  const invalid = structuredClone(created.state);
  invalid.domain.transactions.push({
    id:'invalid-transaction', accountId:'missing-account', source:'migration', sourceTransactionId:null,
    rawName:'Invalid', merchantName:null, amountCents:-1, currency:'USD', authorizedAt:null,
    postedAt:null, displayDate:null, pendingStatus:'posted', movementType:'expense', reviewStatus:'pending',
    locationRegion:null, locationCountry:null, locationSource:null, providerCategory:null,
    createdAt:'2026-07-31T00:00:00.000Z', updatedAt:'2026-07-31T00:00:00.000Z'
  });

  await assert.rejects(() => stateService.save(invalid, created.key, created.meta), /Pre-migration state failed foundation validation/);
  assert.equal(localStorage.getItem(V2_VAULT_KEY), before);
});

test('after migration, repeated unlocks use only the current V2 vault and do not rewrite it', async () => {
  const passphrase = 'correct horse battery staple';
  const legacyRaw = await createLegacyV1Envelope(legacyV1State(), passphrase, deriveKey);
  localStorage.setItem(V1_VAULT_KEY, legacyRaw);
  await service().unlock(passphrase);
  const v2Before = localStorage.getItem(V2_VAULT_KEY);

  const repeated = await service().unlock(passphrase);

  assert.equal(repeated.sourceStorageKey, V2_VAULT_KEY);
  assert.equal(localStorage.getItem(V2_VAULT_KEY), v2Before);
  assert.equal(localStorage.getItem(V1_VAULT_KEY), legacyRaw);
});

test('an encrypted schema-6 reimbursement vault migrates to schema 7 and preserves canonical links across lock and unlock', async () => {
  const passphrase = 'synthetic schema seven vault passphrase';
  const legacyRecovery = await createLegacyV1Envelope(legacyV1State(), passphrase, deriveKey);
  localStorage.setItem(V1_VAULT_KEY, legacyRecovery);
  await createVault(schema6ReimbursementFixtures.safeRepayment(), passphrase);

  const first = await service().unlock(passphrase);
  assert.equal(first.state.schemaVersion, 7);
  assert.equal(first.state.domain.reimbursementClaims.length, 1);
  assert.equal(first.state.domain.reimbursementClaimAllocations.length, 1);
  assert.equal(first.state.domain.reimbursementPaymentLinks.length, 1);
  assert.equal(first.state.legacyFoundation.reimbursementSchema6.claims.length, 1);
  assert.equal(localStorage.getItem(V1_VAULT_KEY), legacyRecovery);
  assert.equal(readVaultRecord().vault.schemaVersion, 7);

  const second = await service().unlock(passphrase);
  assert.deepEqual(second.state, first.state);
  assert.equal(second.sourceStorageKey, V2_VAULT_KEY);
  assert.equal(localStorage.getItem(V1_VAULT_KEY), legacyRecovery);
});

test('an interrupted schema-6-to-7 vault write preserves the active schema-6 vault and succeeds on retry', async () => {
  const passphrase = 'synthetic interrupted schema migration';
  await createVault(schema6ReimbursementFixtures.safeSingle(), passphrase);
  const schema6Raw = localStorage.getItem(V2_VAULT_KEY);
  const storage = localStorage;
  const originalSetItem = storage.setItem.bind(storage);
  let interrupt = true;
  storage.setItem = (key, value) => {
    if (key === V2_VAULT_KEY && interrupt) throw new Error('synthetic schema-7 persistence interruption');
    return originalSetItem(key, value);
  };

  await assert.rejects(() => service().unlock(passphrase), /synthetic schema-7 persistence interruption/);
  assert.equal(localStorage.getItem(V2_VAULT_KEY), schema6Raw);
  assert.ok(localStorage.getItem(V2_TEMP_VAULT_KEY));

  interrupt = false;
  const retried = await service().unlock(passphrase);
  assert.equal(retried.state.schemaVersion, 7);
  assert.equal(localStorage.getItem(V2_TEMP_VAULT_KEY), null);
  assert.notEqual(localStorage.getItem(V2_VAULT_KEY), schema6Raw);
});

test('schema-7 validation rejects an invalid reimbursement save before the encrypted vault is overwritten', async () => {
  const passphrase = 'synthetic invalid schema seven save';
  await createVault(schema6ReimbursementFixtures.safeSingle(), passphrase);
  const stateService = service();
  const unlocked = await stateService.unlock(passphrase);
  const before = localStorage.getItem(V2_VAULT_KEY);
  const invalid = structuredClone(unlocked.state);
  invalid.domain.reimbursementClaimAllocations[0].amountCents = 5000;

  await assert.rejects(() => stateService.save(invalid, unlocked.key, unlocked.meta), /amount exceeds allocation/);
  assert.equal(localStorage.getItem(V2_VAULT_KEY), before);
});

test('failed temporary ciphertext verification leaves the previous active vault usable', async () => {
  const passphrase = 'synthetic temporary verification failure';
  const stateService = service();
  const created = await stateService.create(passphrase, schema6ReimbursementFixtures.safeSingle());
  const before = localStorage.getItem(V2_VAULT_KEY);
  const storage = localStorage;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key !== V2_TEMP_VAULT_KEY) return originalSetItem(key, value);
    const temporary = JSON.parse(value);
    temporary.cipher.ciphertext = temporary.cipher.ciphertext.slice(0, -4) + 'AAAA';
    return originalSetItem(key, JSON.stringify(temporary));
  };

  const changed = structuredClone(created.state);
  changed.preferences.syntheticAcceptanceChange = true;
  await assert.rejects(() => stateService.save(changed, created.key, created.meta));
  assert.equal(localStorage.getItem(V2_VAULT_KEY), before);

  storage.setItem = originalSetItem;
  localStorage.removeItem(V2_TEMP_VAULT_KEY);
  const recovered = await stateService.unlock(passphrase);
  assert.equal(recovered.state.preferences.syntheticAcceptanceChange, undefined);
});
