import assert from 'node:assert/strict';
import test, {beforeEach} from 'node:test';
import {createVault, saveVault, unlock, changePassphrase, readVaultRecord, readVaultGeneration, hasVault, VaultConflictError, VaultAuthRequiredError, VaultPersistenceError} from '../js/vault.js';
import {setSupabaseClientForTests} from '../js/services/supabaseClient.js';
import {installBrowserGlobals, currentFakeVaultsTable, TEST_USER_ID} from './helpers.js';

const passphrase = 'hosted vault coordination acceptance';

beforeEach(() => installBrowserGlobals());

function seedState(overrides = {}) {
  return {
    schemaVersion:7,
    stateRevision:0,
    preferences:{},
    domain:{
      transactions:[], accounts:[], buckets:[], allocations:[],
      reimbursementClaims:[], reimbursementClaimAllocations:[], reimbursementPaymentLinks:[],
      reimbursementAdjustments:[], auditEvents:[]
    },
    ...overrides
  };
}

// --- primary exclusivity property (same acceptance bar as the retired local-lease model) ---

test('two writers holding the same expected generation cannot both report success', async () => {
  const created = await createVault(seedState(), passphrase);
  const table = currentFakeVaultsTable();
  const expected = created.vaultGeneration;

  async function attempt(label) {
    setSupabaseClientForTests(table.client(TEST_USER_ID));
    try {
      const result = await saveVault({...created.state, stateRevision:1, preferences:{writer:label}}, created.key, created.meta, {expectedVaultGeneration:expected});
      return {ok:true, generation:result.vaultGeneration};
    } catch (error) {
      return {ok:false, code:error.code};
    }
  }

  const [first, second] = [await attempt('A'), await attempt('B')];
  const winners = [first, second].filter(r => r.ok);
  const losers = [first, second].filter(r => !r.ok);
  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  assert.equal(losers[0].code, 'VAULT_CONFLICT');
});

test('100-race stress: exactly one winner per identical expected generation', async () => {
  const created = await createVault(seedState(), passphrase);
  const table = currentFakeVaultsTable();
  let winners = 0, conflicts = 0, other = 0;
  for (let i = 0; i < 100; i += 1) {
    // A fresh vault per iteration keeps each race independent (the table has no
    // history, so we reset by creating a new user id per race).
    const userId = `race-user-${i}`;
    const iterationCreated = await (async () => {
      setSupabaseClientForTests(table.client(userId));
      return createVault(seedState(), passphrase);
    })();
    const expected = iterationCreated.vaultGeneration;
    const results = await Promise.all([0, 1].map(async attemptIndex => {
      setSupabaseClientForTests(table.client(userId));
      try {
        await saveVault({...iterationCreated.state, stateRevision:1, preferences:{attempt:attemptIndex}}, iterationCreated.key, iterationCreated.meta, {expectedVaultGeneration:expected});
        return 'win';
      } catch (error) {
        return error.code === 'VAULT_CONFLICT' ? 'conflict' : 'other';
      }
    }));
    winners += results.filter(r => r === 'win').length;
    conflicts += results.filter(r => r === 'conflict').length;
    other += results.filter(r => r === 'other').length;
  }
  assert.equal(winners, 100);
  assert.equal(conflicts, 100);
  assert.equal(other, 0);
});

// --- network-failure lifecycle: the three scenarios named in the phase spec ---

test('a write that never leaves the client is safely retryable and changes nothing', async () => {
  const created = await createVault(seedState(), passphrase);
  const table = currentFakeVaultsTable();
  const before = structuredClone(table.rows.get(TEST_USER_ID));

  setSupabaseClientForTests(table.client(TEST_USER_ID, {failMode:'before-apply'}));
  await assert.rejects(
    () => saveVault({...created.state, stateRevision:1}, created.key, created.meta, {expectedVaultGeneration:created.vaultGeneration}),
    error => error instanceof VaultPersistenceError && error.code === 'VAULT_PERSISTENCE_FAILED'
  );
  assert.deepEqual(table.rows.get(TEST_USER_ID), before);

  setSupabaseClientForTests(table.client(TEST_USER_ID));
  const retried = await saveVault({...created.state, stateRevision:1}, created.key, created.meta, {expectedVaultGeneration:created.vaultGeneration});
  assert.notEqual(retried.vaultGeneration, created.vaultGeneration);
});

test('a response lost after the server committed resolves as success via reconciliation, not a false conflict or silent data loss', async () => {
  const created = await createVault(seedState(), passphrase);
  const table = currentFakeVaultsTable();

  setSupabaseClientForTests(table.client(TEST_USER_ID, {failMode:'after-apply'}));
  const result = await saveVault({...created.state, stateRevision:1, preferences:{committedButAmbiguous:true}}, created.key, created.meta, {expectedVaultGeneration:created.vaultGeneration});
  assert.notEqual(result.vaultGeneration, created.vaultGeneration);

  setSupabaseClientForTests(table.client(TEST_USER_ID));
  const row = table.rows.get(TEST_USER_ID);
  assert.equal(row.generation, result.vaultGeneration);
  assert.equal(row.blob.vaultGeneration, result.vaultGeneration);
});

test('a definite conflict (request reached the server, generation genuinely stale) never reconciles as success', async () => {
  const created = await createVault(seedState(), passphrase);
  const table = currentFakeVaultsTable();
  setSupabaseClientForTests(table.client(TEST_USER_ID));
  const winner = await saveVault({...created.state, stateRevision:1}, created.key, created.meta, {expectedVaultGeneration:created.vaultGeneration});

  await assert.rejects(
    () => saveVault({...created.state, stateRevision:2}, created.key, created.meta, {expectedVaultGeneration:created.vaultGeneration}),
    error => error instanceof VaultConflictError && error.code === 'VAULT_CONFLICT'
  );
  const row = table.rows.get(TEST_USER_ID);
  assert.equal(row.generation, winner.vaultGeneration);
});

// --- cross-device: no Web Lock coordination is possible or assumed between these two clients ---

test('cross-device conflict: two independently-driven clients racing the same row, exactly one wins', async () => {
  const created = await createVault(seedState(), passphrase);
  const table = currentFakeVaultsTable();
  const expected = created.vaultGeneration;

  const deviceA = table.client(TEST_USER_ID);
  const deviceB = table.client(TEST_USER_ID);

  async function writeFrom(client, label) {
    setSupabaseClientForTests(client);
    try {
      const result = await saveVault({...created.state, stateRevision:1, preferences:{device:label}}, created.key, created.meta, {expectedVaultGeneration:expected});
      return {ok:true, generation:result.vaultGeneration};
    } catch (error) {
      return {ok:false, code:error.code};
    }
  }

  const [resultA, resultB] = [await writeFrom(deviceA, 'laptop'), await writeFrom(deviceB, 'phone')];
  const winners = [resultA, resultB].filter(r => r.ok);
  assert.equal(winners.length, 1, 'exactly one device should win the race');
  assert.equal([resultA, resultB].find(r => !r.ok).code, 'VAULT_CONFLICT');
});

// --- auth boundary ---

test('any vault operation without an authenticated session fails closed with a distinguishable error, not a generic failure', async () => {
  setSupabaseClientForTests(currentFakeVaultsTable().client(null));
  await assert.rejects(
    () => createVault(seedState(), passphrase),
    error => error instanceof VaultAuthRequiredError && error.code === 'VAULT_AUTH_REQUIRED'
  );
  // hasVault() propagates the same error rather than collapsing "not signed in" into
  // a plain false -- app.js checks auth state before ever calling hasVault(), and a
  // caller that skips that step should see why it failed, not a misleading "no vault".
  await assert.rejects(
    () => hasVault(),
    error => error instanceof VaultAuthRequiredError && error.code === 'VAULT_AUTH_REQUIRED'
  );
});

// --- rollback: unaffected by the storage-target change, verified end to end ---

test('a rejected save leaves the prior active vault fully unlockable with unchanged state', async () => {
  const created = await createVault(seedState({preferences:{monthlyIncome:1000}}), passphrase);
  const table = currentFakeVaultsTable();

  setSupabaseClientForTests(table.client(TEST_USER_ID, {failMode:'before-apply'}));
  await assert.rejects(() => saveVault({...created.state, stateRevision:1, preferences:{monthlyIncome:99999}}, created.key, created.meta, {expectedVaultGeneration:created.vaultGeneration}));

  setSupabaseClientForTests(table.client(TEST_USER_ID));
  const unlocked = await unlock(passphrase);
  assert.equal(unlocked.state.preferences.monthlyIncome, 1000);
  assert.equal(unlocked.vaultGeneration, created.vaultGeneration);
});

// --- privacy: conflict/persistence errors carry no financial, personal, or raw-cause data ---

test('conflict and persistence errors expose only a stable generic message and code, never raw cause or state', async () => {
  const created = await createVault(seedState({preferences:{monthlyIncome:424242, secretNote:'do not leak me'}}), passphrase);
  const table = currentFakeVaultsTable();
  setSupabaseClientForTests(table.client(TEST_USER_ID));
  await saveVault({...created.state, stateRevision:1}, created.key, created.meta, {expectedVaultGeneration:created.vaultGeneration});

  let conflictError;
  try {
    await saveVault({...created.state, stateRevision:2}, created.key, created.meta, {expectedVaultGeneration:created.vaultGeneration});
  } catch (error) { conflictError = error; }
  assert.equal(conflictError.code, 'VAULT_CONFLICT');
  assert.equal(Object.hasOwn(conflictError, 'cause'), false);
  assert.equal(JSON.stringify(conflictError).includes('424242'), false);
  assert.equal(JSON.stringify(conflictError).includes('secretNote'), false);
  assert.equal(conflictError.message.includes('424242'), false);

  setSupabaseClientForTests(table.client(TEST_USER_ID, {failMode:'before-apply'}));
  let persistenceError;
  try {
    await saveVault({...created.state, stateRevision:2}, created.key, created.meta, {expectedVaultGeneration: (await readVaultGeneration())});
  } catch (error) { persistenceError = error; }
  assert.equal(persistenceError.code, 'VAULT_PERSISTENCE_FAILED');
  assert.equal(Object.hasOwn(persistenceError, 'cause'), false);
  assert.equal(JSON.stringify(persistenceError).includes('424242'), false);
});

// --- generation/blob shape parity with the pre-hosted contract ---

test('generation is embedded in the same blob promoted to the row, matching the pre-hosted single-envelope contract', async () => {
  const created = await createVault(seedState(), passphrase);
  const table = currentFakeVaultsTable();
  const row = table.rows.get(TEST_USER_ID);
  assert.equal(row.generation, created.vaultGeneration);
  assert.equal(row.blob.vaultGeneration, created.vaultGeneration);
  assert.equal(row.blob.cipher.name, 'AES-GCM');
  assert.equal(typeof row.blob.cipher.ciphertext, 'string');
});

test('readVaultRecord and hasVault reflect the hosted row and require nothing local', async () => {
  assert.equal(await hasVault(), false);
  assert.equal(await readVaultRecord(), null);
  const created = await createVault(seedState(), passphrase);
  assert.equal(await hasVault(), true);
  const record = await readVaultRecord();
  assert.equal(record.vault.vaultGeneration, created.vaultGeneration);
  assert.equal(record.isLegacy, false);
});
