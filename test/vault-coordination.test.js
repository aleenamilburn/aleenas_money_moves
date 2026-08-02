import assert from 'node:assert/strict';
import test, {beforeEach} from 'node:test';
import {
  V1_VAULT_KEY, V2_TEMP_VAULT_KEY, V2_VAULT_KEY, V2_VAULT_WRITE_LEASE_KEY
} from '../js/domain/constants.js';
import {migrateState} from '../js/domain/migrations.js';
import {advanceStateRevision} from '../js/services/stateRevision.js';
import {createStateService} from '../js/services/stateService.js';
import {createVaultRepository} from '../js/services/vaultRepository.js';
import {applyBucketChangeWithRollback, updateBucket} from '../js/services/bucketService.js';
import {createAllocationDraft, saveAllocationDraft} from '../js/services/allocationService.js';
import {createClaimMetadataDraft, updateClaimMetadata} from '../js/services/reimbursementService.js';
import {
  VaultConflictError, createVault, exportEncryptedBackup, readVaultGeneration, saveVault, vaultConstants
} from '../js/vault.js';
import {installBrowserGlobals} from './helpers.js';
import {schema6ReimbursementFixtures} from './fixtures/schema6-reimbursements.js';

const passphrase = 'synthetic phase 3c passphrase';
const clone = value => structuredClone(value);
const nextGeneration = () => `mmvg:${crypto.randomUUID()}`;

beforeEach(() => installBrowserGlobals());

function schema7ClaimedState() {
  return migrateState(schema6ReimbursementFixtures.safeSingle(), {now:'2026-07-31T00:00:00.000Z'}).state;
}

function schema7UnclaimedState() {
  const state = schema7ClaimedState();
  state.domain.reimbursementClaims = [];
  state.domain.reimbursementClaimAllocations = [];
  state.domain.allocations[0].ownershipType = 'mine';
  return state;
}

function service(seed = schema7ClaimedState()) {
  return createStateService({repository:createVaultRepository(), seed});
}

function replaceActiveGeneration(generation = nextGeneration()) {
  const envelope = JSON.parse(localStorage.getItem(V2_VAULT_KEY));
  envelope.vaultGeneration = generation;
  localStorage.setItem(V2_VAULT_KEY, JSON.stringify(envelope));
  return {generation, raw:localStorage.getItem(V2_VAULT_KEY)};
}

async function expectConflict(action, operation = null) {
  await assert.rejects(action, error => {
    assert.equal(error instanceof VaultConflictError, true);
    assert.equal(error.code, 'VAULT_CONFLICT');
    assert.equal(error.cause, undefined);
    if (operation) assert.equal(error.operation, operation);
    return true;
  });
}

test('fresh vaults initialize one opaque generation and read, unlock, and backup do not advance it', async () => {
  const state = schema7ClaimedState();
  const created = await service(state).create(passphrase, state);
  const raw = localStorage.getItem(V2_VAULT_KEY);
  const envelope = JSON.parse(raw);

  assert.match(created.vaultGeneration, /^mmvg:/);
  assert.equal(envelope.vaultGeneration, created.vaultGeneration);
  assert.equal(created.meta.vaultGeneration, created.vaultGeneration);
  assert.equal(await readVaultGeneration(), created.vaultGeneration);
  assert.equal((await service().unlock(passphrase)).vaultGeneration, created.vaultGeneration);
  assert.equal(exportEncryptedBackup(), raw);
  assert.equal(await readVaultGeneration(), created.vaultGeneration);
  assert.equal(localStorage.getItem(V2_VAULT_KEY), raw);
  assert.equal(localStorage.getItem(V2_VAULT_WRITE_LEASE_KEY), null);
});

test('an existing V2 envelope without generation unlocks without rewrite and initializes on its first coordinated save', async () => {
  const state = schema7ClaimedState();
  await createVault(state, passphrase);
  const envelope = JSON.parse(localStorage.getItem(V2_VAULT_KEY));
  delete envelope.vaultGeneration;
  const legacyRaw = JSON.stringify(envelope);
  localStorage.setItem(V2_VAULT_KEY, legacyRaw);

  const unlocked = await service().unlock(passphrase);
  assert.match(unlocked.vaultGeneration, /^mmvg:legacy-/);
  assert.equal(localStorage.getItem(V2_VAULT_KEY), legacyRaw);

  unlocked.state.preferences.syntheticGenerationInitialization = true;
  advanceStateRevision(unlocked.state);
  const saved = await service().save(unlocked.state, unlocked.key, unlocked.meta, {
    expectedVaultGeneration:unlocked.vaultGeneration
  });
  assert.notEqual(saved.vaultGeneration, unlocked.vaultGeneration);
  assert.equal(JSON.parse(localStorage.getItem(V2_VAULT_KEY)).vaultGeneration, saved.vaultGeneration);
});

test('valid generation metadata survives reload while malformed generation metadata is rejected without rewrite', async () => {
  const state = schema7ClaimedState();
  const created = await service(state).create(passphrase, state);
  assert.equal((await service().unlock(passphrase)).vaultGeneration, created.vaultGeneration);

  const envelope = JSON.parse(localStorage.getItem(V2_VAULT_KEY));
  envelope.vaultGeneration = 'payer-label-must-not-be-metadata';
  const malformed = JSON.stringify(envelope);
  localStorage.setItem(V2_VAULT_KEY, malformed);
  await assert.rejects(() => service().unlock(passphrase), error => error?.code === 'INVALID_VAULT_GENERATION');
  assert.equal(localStorage.getItem(V2_VAULT_KEY), malformed);
});

test('schema-6-to-7 migration advances generation once and repeated schema-7 unlock is read-only', async () => {
  const created = await createVault(schema6ReimbursementFixtures.safeSingle(), passphrase);
  const migrated = await service().unlock(passphrase);
  assert.equal(migrated.state.schemaVersion, 7);
  assert.notEqual(migrated.vaultGeneration, created.vaultGeneration);
  const raw = localStorage.getItem(V2_VAULT_KEY);
  const repeated = await service().unlock(passphrase);
  assert.equal(repeated.vaultGeneration, migrated.vaultGeneration);
  assert.equal(localStorage.getItem(V2_VAULT_KEY), raw);
});

test('two writers reject stale save, preserve active ciphertext and generation, then allow reload and retry', async () => {
  const stateService = service();
  await stateService.create(passphrase, schema7ClaimedState());
  const a = await stateService.unlock(passphrase);
  const b = await stateService.unlock(passphrase);
  assert.equal(a.vaultGeneration, b.vaultGeneration);

  a.state.preferences.writer = 'A';
  advanceStateRevision(a.state);
  const savedA = await stateService.save(a.state, a.key, a.meta, {expectedVaultGeneration:a.vaultGeneration});
  const activeAfterA = localStorage.getItem(V2_VAULT_KEY);

  b.state.preferences.writer = 'B';
  advanceStateRevision(b.state);
  await expectConflict(() => stateService.save(b.state, b.key, b.meta, {expectedVaultGeneration:b.vaultGeneration}), 'save');
  assert.equal(localStorage.getItem(V2_VAULT_KEY), activeAfterA);
  assert.equal(await readVaultGeneration(), savedA.vaultGeneration);
  assert.equal(localStorage.getItem(V2_TEMP_VAULT_KEY), null);

  const reloaded = await stateService.unlock(passphrase);
  assert.equal(reloaded.state.preferences.writer, 'A');
  reloaded.state.preferences.writer = 'B';
  advanceStateRevision(reloaded.state);
  const savedB = await stateService.save(reloaded.state, reloaded.key, reloaded.meta, {expectedVaultGeneration:reloaded.vaultGeneration});
  assert.notEqual(savedB.vaultGeneration, savedA.vaultGeneration);
  assert.equal((await stateService.unlock(passphrase)).state.preferences.writer, 'B');
});

test('the origin-wide writer lock allows exactly one winner in 100 concurrent same-generation races', async () => {
  const stateService = service();
  const created = await stateService.create(passphrase, schema7ClaimedState());
  let canonical = created.state;
  let generation = created.vaultGeneration;
  let meta = created.meta;
  let successes = 0;
  let conflicts = 0;
  let otherFailures = 0;

  for (let index = 0; index < 100; index += 1) {
    const stateA = clone(canonical);
    const stateB = clone(canonical);
    stateA.preferences.stressWriter = `A-${index}`;
    stateB.preferences.stressWriter = `B-${index}`;
    advanceStateRevision(stateA);
    advanceStateRevision(stateB);

    let markAcquired;
    let releaseWinner;
    const acquired = new Promise(resolve => { markAcquired = resolve; });
    const holdWinner = new Promise(resolve => { releaseWinner = resolve; });
    const writerA = stateService.save(stateA, created.key, meta, {
      expectedVaultGeneration:generation,
      coordination:{afterPlatformLockAcquired:async () => {
        markAcquired();
        await holdWinner;
      }}
    });
    await acquired;
    const writerB = stateService.save(stateB, created.key, meta, {expectedVaultGeneration:generation});
    releaseWinner();
    const results = await Promise.allSettled([writerA, writerB]);
    const fulfilled = results.filter(result => result.status === 'fulfilled');
    const rejected = results.filter(result => result.status === 'rejected');
    assert.equal(fulfilled.length, 1, `race ${index} winner count`);
    assert.equal(rejected.length, 1, `race ${index} rejection count`);
    assert.equal(rejected[0].reason?.code, 'VAULT_CONFLICT', `race ${index} rejection code`);
    successes += fulfilled.length;
    conflicts += rejected.filter(result => result.reason?.code === 'VAULT_CONFLICT').length;
    otherFailures += rejected.filter(result => result.reason?.code !== 'VAULT_CONFLICT').length;
    canonical = fulfilled[0].value.state;
    generation = fulfilled[0].value.vaultGeneration;
    meta = fulfilled[0].value.meta;
  }

  assert.equal(successes, 100);
  assert.equal(conflicts, 100);
  assert.equal(otherFailures, 0);
  assert.equal(navigator.locks.maxActive, 1);
  assert.equal(canonical.stateRevision, created.state.stateRevision + 100);
  const authoritative = await stateService.unlock(passphrase);
  assert.deepEqual(authoritative.state, canonical);
  assert.equal(authoritative.vaultGeneration, generation);
});

test('production-required platform locking fails closed and hides lock-manager acquisition errors', async () => {
  const stateService = service();
  const created = await stateService.create(passphrase, schema7ClaimedState());
  const active = localStorage.getItem(V2_VAULT_KEY);
  const changed = clone(created.state);
  changed.preferences.platformLockRequired = true;
  advanceStateRevision(changed);

  await expectConflict(() => stateService.save(changed, created.key, created.meta, {
    expectedVaultGeneration:created.vaultGeneration,
    coordination:{platformLockManager:null, requirePlatformLock:true}
  }));
  assert.equal(localStorage.getItem(V2_VAULT_KEY), active);

  const rawMessage = 'synthetic platform internals must stay private';
  let conflict;
  try {
    await stateService.save(changed, created.key, created.meta, {
      expectedVaultGeneration:created.vaultGeneration,
      coordination:{platformLockManager:{request:async () => { throw new Error(rawMessage); }}, requirePlatformLock:true}
    });
  } catch (error) {
    conflict = error;
  }
  assert.equal(conflict?.code, 'VAULT_CONFLICT');
  assert.equal(conflict?.message.includes(rawMessage), false);
  assert.equal(conflict?.cause, undefined);
  assert.equal(localStorage.getItem(V2_VAULT_KEY), active);
});

test('raw storage failures are converted to a stable private persistence error', async () => {
  const stateService = service();
  const created = await stateService.create(passphrase, schema7ClaimedState());
  const active = localStorage.getItem(V2_VAULT_KEY);
  const changed = clone(created.state);
  changed.preferences.storageFailure = true;
  advanceStateRevision(changed);
  const setItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, value) => {
    if (key === V2_TEMP_VAULT_KEY) throw new Error('raw quota and storage internals');
    return setItem(key, value);
  };
  let failure;
  try {
    await stateService.save(changed, created.key, created.meta, {expectedVaultGeneration:created.vaultGeneration});
  } catch (error) {
    failure = error;
  } finally {
    localStorage.setItem = setItem;
  }
  assert.equal(failure?.code, 'VAULT_PERSISTENCE_FAILED');
  assert.equal(failure?.message.includes('raw quota'), false);
  assert.equal(failure?.cause, undefined);
  assert.equal(localStorage.getItem(V2_VAULT_KEY), active);
  assert.equal(await readVaultGeneration(), created.vaultGeneration);
});

test('three writers serialize one commit and repeated stale retries never advance generation', async () => {
  const stateService = service();
  await stateService.create(passphrase, schema7ClaimedState());
  const [a,b,c] = await Promise.all([stateService.unlock(passphrase), stateService.unlock(passphrase), stateService.unlock(passphrase)]);
  a.state.preferences.writer = 'A';
  advanceStateRevision(a.state);
  const committed = await stateService.save(a.state, a.key, a.meta, {expectedVaultGeneration:a.vaultGeneration});
  const active = localStorage.getItem(V2_VAULT_KEY);
  for (const stale of [b,c,b]) {
    stale.state.preferences.writer = 'stale';
    advanceStateRevision(stale.state);
    await expectConflict(() => stateService.save(stale.state, stale.key, stale.meta, {expectedVaultGeneration:stale.vaultGeneration}));
    assert.equal(localStorage.getItem(V2_VAULT_KEY), active);
    assert.equal(await readVaultGeneration(), committed.vaultGeneration);
  }
});

for (const [name, hookName] of [
  ['before temporary write', 'beforeTemporaryWrite'],
  ['after temporary write', 'afterTemporaryWrite'],
  ['immediately before promotion', 'beforePromotion']
]) {
  test(`a generation change ${name} aborts promotion and safely discards the stale temporary record`, async () => {
    const stateService = service();
    const created = await stateService.create(passphrase, schema7ClaimedState());
    const changed = clone(created.state);
    changed.preferences.interleaving = hookName;
    advanceStateRevision(changed);
    let newer;
    await expectConflict(() => stateService.save(changed, created.key, created.meta, {
      expectedVaultGeneration:created.vaultGeneration,
      coordination:{[hookName]:async () => { newer = replaceActiveGeneration(); }}
    }));
    assert.equal(localStorage.getItem(V2_VAULT_KEY), newer.raw);
    assert.equal(await readVaultGeneration(), newer.generation);
    assert.equal(localStorage.getItem(V2_TEMP_VAULT_KEY), null);
  });
}

test('an active lease rejects another writer, an expired lease recovers, and an abandoned malformed lease is replaceable', async () => {
  const stateService = service();
  const created = await stateService.create(passphrase, schema7ClaimedState());
  const changed = clone(created.state);
  changed.preferences.lease = true;
  advanceStateRevision(changed);
  const activeBefore = localStorage.getItem(V2_VAULT_KEY);

  localStorage.setItem(V2_VAULT_WRITE_LEASE_KEY, JSON.stringify({version:1, ownerToken:'active-writer', expiresAt:Date.now()+60000}));
  await expectConflict(() => stateService.save(changed, created.key, created.meta, {expectedVaultGeneration:created.vaultGeneration}));
  assert.equal(localStorage.getItem(V2_VAULT_KEY), activeBefore);

  localStorage.setItem(V2_VAULT_WRITE_LEASE_KEY, JSON.stringify({version:1, ownerToken:'abandoned-writer', expiresAt:Date.now()-1}));
  const recovered = await stateService.save(changed, created.key, created.meta, {expectedVaultGeneration:created.vaultGeneration});
  assert.notEqual(recovered.vaultGeneration, created.vaultGeneration);
  assert.equal(localStorage.getItem(V2_VAULT_WRITE_LEASE_KEY), null);

  const latest = await stateService.unlock(passphrase);
  localStorage.setItem(V2_VAULT_WRITE_LEASE_KEY, '{malformed lease');
  latest.state.preferences.malformedLeaseRecovered = true;
  advanceStateRevision(latest.state);
  await stateService.save(latest.state, latest.key, latest.meta, {expectedVaultGeneration:latest.vaultGeneration});
  assert.equal(localStorage.getItem(V2_VAULT_WRITE_LEASE_KEY), null);
});

test('lock owner mismatch and owner-token collision fail closed without changing the active vault', async () => {
  const stateService = service();
  const created = await stateService.create(passphrase, schema7ClaimedState());
  const changed = clone(created.state);
  changed.preferences.lockMismatch = true;
  advanceStateRevision(changed);
  const active = localStorage.getItem(V2_VAULT_KEY);

  await expectConflict(() => stateService.save(changed, created.key, created.meta, {
    expectedVaultGeneration:created.vaultGeneration,
    coordination:{ownerToken:'collision-token', afterTemporaryWrite:async () => {
      localStorage.setItem(V2_VAULT_WRITE_LEASE_KEY, JSON.stringify({version:1, ownerToken:'different-owner', expiresAt:Date.now()+60000}));
    }}
  }));
  assert.equal(localStorage.getItem(V2_VAULT_KEY), active);
  assert.equal(localStorage.getItem(V2_TEMP_VAULT_KEY), null);
  assert.equal(JSON.parse(localStorage.getItem(V2_VAULT_WRITE_LEASE_KEY)).ownerToken, 'different-owner');

  localStorage.setItem(V2_VAULT_WRITE_LEASE_KEY, JSON.stringify({version:1, ownerToken:'collision-token', expiresAt:Date.now()+60000}));
  await expectConflict(() => stateService.save(changed, created.key, created.meta, {
    expectedVaultGeneration:created.vaultGeneration,
    coordination:{ownerToken:'collision-token'}
  }));
  assert.equal(localStorage.getItem(V2_VAULT_KEY), active);
});

test('deleted or replaced lease ownership after temporary verification blocks promotion', async () => {
  for (const mode of ['deleted', 'replaced']) {
    installBrowserGlobals();
    const stateService = service();
    const created = await stateService.create(passphrase, schema7ClaimedState());
    const active = localStorage.getItem(V2_VAULT_KEY);
    const changed = clone(created.state);
    changed.preferences.leaseInterference = mode;
    advanceStateRevision(changed);
    await expectConflict(() => stateService.save(changed, created.key, created.meta, {
      expectedVaultGeneration:created.vaultGeneration,
      coordination:{afterTemporaryVerification:async () => {
        if (mode === 'deleted') localStorage.removeItem(V2_VAULT_WRITE_LEASE_KEY);
        else localStorage.setItem(V2_VAULT_WRITE_LEASE_KEY, JSON.stringify({
          version:1,
          ownerToken:'replacement-owner',
          expiresAt:Date.now()+60000
        }));
      }}
    }));
    assert.equal(localStorage.getItem(V2_VAULT_KEY), active);
    assert.equal(localStorage.getItem(V2_TEMP_VAULT_KEY), null);
  }
});

test('a crash after active promotion leaves one coherent authoritative generation and recoverable temp evidence', async () => {
  const stateService = service();
  const created = await stateService.create(passphrase, schema7ClaimedState());
  const changed = clone(created.state);
  changed.preferences.crashAfterPromotion = true;
  advanceStateRevision(changed);
  await assert.rejects(() => stateService.save(changed, created.key, created.meta, {
    expectedVaultGeneration:created.vaultGeneration,
    coordination:{afterActivePromotion:async () => { throw new Error('synthetic process termination'); }}
  }));
  const active = JSON.parse(localStorage.getItem(V2_VAULT_KEY));
  const temporary = JSON.parse(localStorage.getItem(V2_TEMP_VAULT_KEY));
  assert.equal(active.vaultGeneration, temporary.vaultGeneration);
  assert.equal(active.pendingWrite, undefined);
  assert.equal(temporary.pendingWrite.previousVaultGeneration, created.vaultGeneration);
  assert.equal(localStorage.getItem(V2_VAULT_WRITE_LEASE_KEY), null);
  const recovered = await stateService.unlock(passphrase);
  assert.equal(recovered.state.preferences.crashAfterPromotion, true);
  assert.equal(recovered.vaultGeneration, active.vaultGeneration);
  recovered.state.preferences.afterCrashRecovery = true;
  advanceStateRevision(recovered.state);
  const saved = await stateService.save(recovered.state, recovered.key, recovered.meta, {
    expectedVaultGeneration:recovered.vaultGeneration
  });
  assert.notEqual(saved.vaultGeneration, recovered.vaultGeneration);
  assert.equal(localStorage.getItem(V2_TEMP_VAULT_KEY), null);
});

test('an expired lease during encryption cannot be renewed or promoted', async () => {
  const stateService = service();
  const created = await stateService.create(passphrase, schema7ClaimedState());
  const changed = clone(created.state);
  changed.preferences.expiredDuringWrite = true;
  advanceStateRevision(changed);
  const times = [1000, 1000, 5000, 5000];
  const active = localStorage.getItem(V2_VAULT_KEY);
  await expectConflict(() => stateService.save(changed, created.key, created.meta, {
    expectedVaultGeneration:created.vaultGeneration,
    coordination:{leaseMs:1000, now:() => times.shift() ?? 5000}
  }));
  assert.equal(localStorage.getItem(V2_VAULT_KEY), active);
  assert.equal(localStorage.getItem(V2_TEMP_VAULT_KEY), null);
});

test('valid generation tampering is detected by a loaded writer even when no storage event is observed', async () => {
  const stateService = service();
  const loaded = await stateService.create(passphrase, schema7ClaimedState());
  const newer = replaceActiveGeneration();
  const changed = clone(loaded.state);
  changed.preferences.noStorageEvent = true;
  advanceStateRevision(changed);
  await expectConflict(() => stateService.save(changed, loaded.key, loaded.meta, {expectedVaultGeneration:loaded.vaultGeneration}));
  assert.equal(localStorage.getItem(V2_VAULT_KEY), newer.raw);
});

test('allocation and bucket operations deep-rollback stateRevision and canonical facts on VAULT_CONFLICT', async () => {
  const initial = schema7UnclaimedState();
  const stateService = service(initial);
  await stateService.create(passphrase, initial);
  const allocationA = await stateService.unlock(passphrase);
  const allocationB = await stateService.unlock(passphrase);
  const draftA = createAllocationDraft(allocationA.state, 'expense-single');
  draftA.rows[0].ownershipType = 'reimbursable';
  let generationA = allocationA.vaultGeneration;
  await saveAllocationDraft(allocationA.state, 'expense-single', draftA.rows, async () => {
    const saved = await stateService.save(allocationA.state, allocationA.key, allocationA.meta, {expectedVaultGeneration:generationA});
    generationA = saved.vaultGeneration;
  });

  const allocationBefore = clone(allocationB.state);
  const draftB = createAllocationDraft(allocationB.state, 'expense-single');
  draftB.rows[0].note = 'stale note';
  await expectConflict(() => saveAllocationDraft(allocationB.state, 'expense-single', draftB.rows, async () => {
    await stateService.save(allocationB.state, allocationB.key, allocationB.meta, {expectedVaultGeneration:allocationB.vaultGeneration});
  }));
  assert.deepEqual(allocationB.state, allocationBefore);

  const bucketFresh = await stateService.unlock(passphrase);
  const bucketStale = await stateService.unlock(passphrase);
  let bucketGeneration = bucketFresh.vaultGeneration;
  await applyBucketChangeWithRollback(bucketFresh.state, () => updateBucket(bucketFresh.state, 'synthetic-bucket', {name:'Committed bucket'}), async () => {
    const saved = await stateService.save(bucketFresh.state, bucketFresh.key, bucketFresh.meta, {expectedVaultGeneration:bucketGeneration});
    bucketGeneration = saved.vaultGeneration;
  });
  const bucketBefore = clone(bucketStale.state);
  await expectConflict(() => applyBucketChangeWithRollback(bucketStale.state, () => updateBucket(bucketStale.state, 'synthetic-bucket', {name:'Stale bucket'}), async () => {
    await stateService.save(bucketStale.state, bucketStale.key, bucketStale.meta, {expectedVaultGeneration:bucketStale.vaultGeneration});
  }));
  assert.deepEqual(bucketStale.state, bucketBefore);
  assert.equal((await stateService.unlock(passphrase)).state.domain.buckets[0].name, 'Committed bucket');
});

test('reimbursement service preserves VAULT_CONFLICT and rolls back claims, relationships, audit, and revision', async () => {
  const stateService = service();
  await stateService.create(passphrase, schema7ClaimedState());
  const a = await stateService.unlock(passphrase);
  const b = await stateService.unlock(passphrase);
  const draftA = createClaimMetadataDraft(a.state, a.state.domain.reimbursementClaims[0].id);
  draftA.payerLabel = 'Synthetic writer A';
  let generationA = a.vaultGeneration;
  await updateClaimMetadata(a.state, draftA, async () => {
    const saved = await stateService.save(a.state, a.key, a.meta, {expectedVaultGeneration:generationA});
    generationA = saved.vaultGeneration;
  }, {now:'2026-07-31T12:00:00.000Z'});

  const before = clone(b.state);
  const draftB = createClaimMetadataDraft(b.state, b.state.domain.reimbursementClaims[0].id);
  draftB.payerLabel = 'Synthetic writer B';
  await expectConflict(() => updateClaimMetadata(b.state, draftB, async () => {
    await stateService.save(b.state, b.key, b.meta, {expectedVaultGeneration:b.vaultGeneration});
  }, {now:'2026-07-31T12:01:00.000Z'}));
  assert.deepEqual(b.state, before);
  const authoritative = await stateService.unlock(passphrase);
  assert.equal(authoritative.state.domain.reimbursementClaims[0].payerLabel, 'Synthetic writer A');
});

test('restore captures the active generation before verification and rejects a stale replacement without changing active or legacy evidence', async () => {
  const stateService = service();
  const created = await stateService.create(passphrase, schema7ClaimedState());
  const backup = stateService.exportEncryptedBackup();
  const legacyEvidence = 'synthetic-legacy-recovery';
  localStorage.setItem(V1_VAULT_KEY, legacyEvidence);
  const expected = created.vaultGeneration;
  const writer = await stateService.unlock(passphrase);
  writer.state.preferences.restoreConflict = 'newer';
  advanceStateRevision(writer.state);
  await stateService.save(writer.state, writer.key, writer.meta, {expectedVaultGeneration:writer.vaultGeneration});
  const active = localStorage.getItem(V2_VAULT_KEY);

  await expectConflict(() => stateService.restore(backup, passphrase, {expectedVaultGeneration:expected}));
  assert.equal(localStorage.getItem(V2_VAULT_KEY), active);
  assert.equal(localStorage.getItem(V1_VAULT_KEY), legacyEvidence);
  assert.equal((await stateService.unlock(passphrase)).state.preferences.restoreConflict, 'newer');
});

test('successful restore rebases generation once, preserves backup stateRevision, and backup itself is read-only', async () => {
  const stateService = service();
  const created = await stateService.create(passphrase, schema7ClaimedState());
  const backup = stateService.exportEncryptedBackup();
  const backupRevision = created.state.stateRevision;
  const beforeBackupGeneration = await readVaultGeneration();
  assert.equal(await readVaultGeneration(), beforeBackupGeneration);

  const restored = await stateService.restore(backup, passphrase, {expectedVaultGeneration:created.vaultGeneration});
  assert.notEqual(restored.vaultGeneration, created.vaultGeneration);
  assert.equal(restored.state.stateRevision, backupRevision);
  assert.equal((await stateService.unlock(passphrase)).state.stateRevision, backupRevision);
});

test('passphrase change rejects a stale tab and successful re-encryption advances only vaultGeneration', async () => {
  const stateService = service();
  await stateService.create(passphrase, schema7ClaimedState());
  const a = await stateService.unlock(passphrase);
  const b = await stateService.unlock(passphrase);
  a.state.preferences.passphraseConflict = true;
  advanceStateRevision(a.state);
  await stateService.save(a.state, a.key, a.meta, {expectedVaultGeneration:a.vaultGeneration});
  const active = localStorage.getItem(V2_VAULT_KEY);
  await expectConflict(() => stateService.changePassphrase(b.state, passphrase, 'synthetic new passphrase', {
    expectedVaultGeneration:b.vaultGeneration
  }), 'change-passphrase');
  assert.equal(localStorage.getItem(V2_VAULT_KEY), active);

  const fresh = await stateService.unlock(passphrase);
  const revision = fresh.state.stateRevision;
  const changed = await stateService.changePassphrase(fresh.state, passphrase, 'synthetic new passphrase', {
    expectedVaultGeneration:fresh.vaultGeneration
  });
  assert.notEqual(changed.vaultGeneration, fresh.vaultGeneration);
  assert.equal(changed.state.stateRevision, revision);
  await assert.rejects(() => stateService.unlock(passphrase));
  const unlocked = await stateService.unlock('synthetic new passphrase');
  assert.equal(unlocked.state.stateRevision, revision);
});

test('conflict errors and coordination metadata contain no financial or secret fields', async () => {
  const stateService = service();
  const created = await stateService.create(passphrase, schema7ClaimedState());
  replaceActiveGeneration();
  const changed = clone(created.state);
  changed.preferences.secretNote = 'never expose this note';
  advanceStateRevision(changed);
  let conflict;
  try {
    await stateService.save(changed, created.key, created.meta, {expectedVaultGeneration:created.vaultGeneration});
  } catch (error) {
    conflict = error;
  }
  assert.equal(conflict.code, 'VAULT_CONFLICT');
  assert.equal(conflict.cause, undefined);
  assert.equal(conflict.message.includes('never expose'), false);
  assert.equal(JSON.stringify(conflict).includes('ciphertext'), false);

  const envelope = JSON.parse(localStorage.getItem(V2_VAULT_KEY));
  assert.deepEqual(Object.keys(envelope).sort(), [
    'cipher','createdAt','kdf','product','schemaVersion','updatedAt','vaultGeneration','version'
  ]);
  assert.equal(JSON.stringify(envelope).includes('Synthetic payer'), false);
  assert.equal(JSON.stringify(envelope).includes(passphrase), false);
  assert.equal(envelope.pendingWrite, undefined);
  assert.equal(localStorage.getItem(vaultConstants.WRITE_LEASE_KEY), null);
});

test('failed coordinated save leaves generation, active vault, stateRevision, and legacy evidence unchanged', async () => {
  const stateService = service();
  const created = await stateService.create(passphrase, schema7ClaimedState());
  const active = localStorage.getItem(V2_VAULT_KEY);
  const legacyEvidence = 'preserve-legacy-evidence';
  localStorage.setItem(V1_VAULT_KEY, legacyEvidence);
  const changed = clone(created.state);
  const revision = changed.stateRevision;
  changed.preferences.failedWrite = true;
  advanceStateRevision(changed);
  await expectConflict(() => saveVault(changed, created.key, created.meta, {
    expectedVaultGeneration:nextGeneration()
  }));
  assert.equal(localStorage.getItem(V2_VAULT_KEY), active);
  assert.equal(await readVaultGeneration(), created.vaultGeneration);
  assert.equal(created.state.stateRevision, revision);
  assert.equal(localStorage.getItem(V1_VAULT_KEY), legacyEvidence);
  assert.equal(localStorage.getItem(V2_TEMP_VAULT_KEY), null);
});
