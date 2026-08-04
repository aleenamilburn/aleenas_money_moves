// V1 recovery data predates any notion of an authenticated account and is never
// blended into a signed-in user's hosted vault automatically -- the product owner's
// hosted-storage decision was explicit: existing local data is discarded, no import,
// no dual-write. What remains is the underlying invariant this whole product line
// has never relaxed: V1 data is never deleted, and it stays available as a manual
// recovery primitive even though nothing in the active UI flow reaches for it
// anymore. This file replaces test/vault-migration.test.js, whose ~15 tests all
// exercised the now-removed automatic V1-to-V2-storage migration that used to run
// inside unlock().

import assert from 'node:assert/strict';
import test, {beforeEach} from 'node:test';
import {V1_LEGACY_STATE_KEY, V1_VAULT_KEY} from '../js/domain/constants.js';
import {createVault, deriveKey, hasVault, readLegacyState, readLocalV1Record, readVaultRecord} from '../js/vault.js';
import {createLegacyV1Envelope, installBrowserGlobals, legacyV1State} from './helpers.js';

beforeEach(() => installBrowserGlobals());

const passphrase = 'v1 local recovery acceptance';

test('a V1 vault present in this browser is never surfaced by the hosted read path', async () => {
  const legacyRaw = await createLegacyV1Envelope(legacyV1State(), passphrase, deriveKey);
  localStorage.setItem(V1_VAULT_KEY, legacyRaw);

  assert.equal(await hasVault(), false);
  assert.equal(await readVaultRecord(), null);
  assert.equal(localStorage.getItem(V1_VAULT_KEY), legacyRaw);
});

test('creating a hosted vault does not touch or consume local V1 data', async () => {
  const legacyRaw = await createLegacyV1Envelope(legacyV1State(), passphrase, deriveKey);
  localStorage.setItem(V1_VAULT_KEY, legacyRaw);

  await createVault({schemaVersion:7, stateRevision:0, preferences:{}, domain:{transactions:[], accounts:[], buckets:[], allocations:[], reimbursementClaims:[], reimbursementClaimAllocations:[], reimbursementPaymentLinks:[], reimbursementAdjustments:[], auditEvents:[]}}, passphrase);

  assert.equal(localStorage.getItem(V1_VAULT_KEY), legacyRaw);
});

test('readLocalV1Record remains a functional manual recovery primitive', async () => {
  assert.equal(readLocalV1Record(), null);
  const legacyRaw = await createLegacyV1Envelope(legacyV1State(), passphrase, deriveKey);
  localStorage.setItem(V1_VAULT_KEY, legacyRaw);
  const record = readLocalV1Record();
  assert.equal(record.isLegacy, true);
  assert.equal(record.raw, legacyRaw);
});

test('readLegacyState remains available for the pre-encryption plaintext recovery key', () => {
  assert.equal(readLegacyState(), null);
  const legacy = legacyV1State();
  legacy.goals = [{id:'goal-1', name:'Preserve me'}];
  localStorage.setItem(V1_LEGACY_STATE_KEY, JSON.stringify(legacy));
  assert.deepEqual(readLegacyState().goals, legacy.goals);
});
