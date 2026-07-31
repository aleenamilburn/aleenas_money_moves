import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test, {beforeEach} from 'node:test';
import {migrateState} from '../js/domain/migrations.js';
import {archiveBucket, bucketLedgerRows, createBucket, deleteBucket, listBuckets, moveChildBucket, queryBucketDetail, queryUnassignedTransactions, reorderBucket, restoreBucket, updateBucket} from '../js/services/bucketService.js';
import {createStateService} from '../js/services/stateService.js';
import {createVaultRepository} from '../js/services/vaultRepository.js';
import {installBrowserGlobals} from './helpers.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/v1-buckets.json', import.meta.url), 'utf8'));
const now = '2026-07-31T12:00:00.000Z';
const migrated = () => migrateState(fixture, {now}).state;

beforeEach(() => installBrowserGlobals());

test('V1 bucket fixture migrates in stable order without losing legacy fields', () => {
  const state = migrated();
  assert.deepEqual(listBuckets(state, {parentId:null}).map(item => item.id), ['travel', 'food']);
  assert.equal(listBuckets(state, {includeArchived:true, parentId:null})[2].id, 'old');
  assert.equal(state.domain.buckets.find(item => item.id === 'old').active, false);
  assert.equal(state.domain.buckets[0].targetCents, 50000);
  assert.equal(state.domain.legacyMonthlySnapshots[0].bucketActualsCents.food, 12000);
  assert.equal(queryBucketDetail(state, 'travel').rows.length, 0);
  assert.equal(state.review.transactions[0].customTransactionField, 'keep');
  assert.equal(state.categories[0].customCategoryField, 'keep');
  assert.equal(state.review.merchantRules[0].customRuleField, 'keep');
  assert.equal(state.preferences.customPreference, 'keep');
  assert.deepEqual(state.monthly.customMonthlyField, {keep:true});
  assert.equal(state.debts[0].name, 'Keep debt');
  assert.equal(state.goals[0].name, 'Keep goal');
});

test('bucket mutations enforce exactly two levels, sibling names, stable IDs, and deterministic order', () => {
  const state = migrated();
  updateBucket(state, 'food', {name:'Food and dining'}, {now});
  reorderBucket(state, 'food', 'up', {now});
  assert.equal(state.domain.buckets.find(item => item.id === 'food').id, 'food');
  const childId = createBucket(state, {parentId:'food', name:'Groceries', target:125}, {id:'food-groceries', now});
  assert.equal(state.review.buckets.find(item => item.id === childId).parentId, 'food');
  assert.throws(() => createBucket(state, {parentId:childId, name:'Produce'}, {now}), error => error.code === 'MAX_DEPTH');
  assert.throws(() => createBucket(state, {parentId:'food', name:' groceries '}, {now}), error => error.code === 'DUPLICATE_NAME');
  createBucket(state, {parentId:'food', name:'Dining'}, {id:'food-dining', now});
  assert.equal(reorderBucket(state, 'food-dining', 'up', {now}), true);
  assert.deepEqual(listBuckets(state, {parentId:'food'}).map(item => item.id), ['food-dining', 'food-groceries']);
  moveChildBucket(state, 'food-dining', 'travel', {now});
  assert.equal(state.domain.buckets.find(item => item.id === 'food-dining').parentId, 'travel');
  updateBucket(state, childId, {name:'Market groceries', description:'Weekly food'}, {now});
  assert.equal(state.domain.buckets.find(item => item.id === childId).id, childId);
});

test('one ledger path rolls child totals up, avoids double counting, and records trace sources', () => {
  const state = migrated();
  createBucket(state, {parentId:'food', name:'Groceries'}, {id:'food-groceries', now});
  state.domain.transactions=state.domain.transactions.filter(item=>item.id!=='legacy-food-1');
  state.domain.allocations=state.domain.allocations.filter(item=>item.transactionId!=='legacy-food-1');
  state.domain.transactions.push({id:'legacy-food-1', accountId:'unknown-account', source:'migration', sourceTransactionId:null, rawName:'Canonical market', merchantName:'Canonical market', amountCents:-1234, currency:'USD', authorizedAt:null, postedAt:'2026-07-20', displayDate:'2026-07-20', pendingStatus:'posted', movementType:'expense', reviewStatus:'reviewed', locationRegion:null, locationCountry:null, locationSource:null, providerCategory:null, manualOverrides:null, createdAt:now, updatedAt:now});
  state.domain.allocations.push({id:'allocation-1', transactionId:'legacy-food-1', bucketId:'food', subBucketId:'food-groceries', amountCents:1234, ownershipType:'personal', note:null, reimbursementClaimId:null, createdAt:now, updatedAt:now});
  state.review.transactions.push({id:'legacy-direct-2', date:'2026-07-22', merchant:'Cafe', amount:10, account:'Card', flow:'outflow', bucketId:'food', reviewStatus:'pending'});
  const rows = bucketLedgerRows(state);
  assert.equal(rows.filter(row => row.transactionId === 'legacy-food-1').length, 1);
  assert.equal(rows.find(row => row.transactionId === 'legacy-food-1').source, 'canonical-allocation');
  const detail = queryBucketDetail(state, 'food');
  assert.equal(detail.directCents, 1000);
  assert.equal(detail.rolledUpCents, 2234);
  assert.equal(detail.childTotals[0].amountCents, 1234);
  assert.equal(queryBucketDetail(state, 'food', {assignment:'child'}).rolledUpCents, 1234);
  assert.equal(queryBucketDetail(state, 'food', {search:'card'}).rolledUpCents, 1000);
  assert.equal(queryBucketDetail(state, 'food', {from:'2026-07-21'}).rolledUpCents, 1000);
  assert.equal(queryBucketDetail(state, 'food', {accountId:'unknown-account'}).rolledUpCents, 1234);
  assert.equal(queryBucketDetail(state, 'food', {reviewStatus:'unreviewed'}).rolledUpCents, 1000);
  assert.equal(detail.rows.every(row => row.trace), true);
  archiveBucket(state, 'food-groceries', {now});
  assert.equal(queryBucketDetail(state, 'food').rolledUpCents, 2234);
});

test('archive preserves referenced history; missing account and location facts remain explicit', () => {
  const state = migrated();
  archiveBucket(state, 'food', {now});
  const archived = state.domain.buckets.find(item => item.id === 'food');
  assert.equal(archived.active, false);
  assert.equal(queryBucketDetail(state, 'food').rows[0].accountName, 'Checking');
  assert.equal(queryBucketDetail(state, 'food').rows[0].locationRegion, null);
  assert.throws(() => deleteBucket(state, 'food'), error => error.code === 'BUCKET_REFERENCED');
  restoreBucket(state, 'food', {now});
  assert.equal(archived.active, true);
  assert.equal(archived.archivedAt, null);
  assert.equal(queryUnassignedTransactions(state)[0].accountName, 'Unknown account');
});

test('bucket hierarchy and archive changes survive encrypted save and reload', async () => {
  const passphrase = 'correct horse battery staple';
  const service = createStateService({repository:createVaultRepository(), seed:fixture});
  const created = await service.create(passphrase, fixture);
  createBucket(created.state, {parentId:'food', name:'Dining'}, {id:'food-dining', now});
  archiveBucket(created.state, 'food-dining', {now});
  await service.save(created.state, created.key, created.meta);
  const unlocked = await service.unlock(passphrase);
  const child = unlocked.state.domain.buckets.find(item => item.id === 'food-dining');
  assert.equal(child.parentId, 'food');
  assert.equal(child.active, false);
  assert.equal(unlocked.state.review.buckets.find(item => item.id === child.id).active, false);
});
