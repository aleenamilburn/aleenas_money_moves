import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test, {beforeEach} from 'node:test';
import {migrateState, validateFoundationDomain} from '../js/domain/migrations.js';
import {validateBucketTree} from '../js/domain/models.js';
import {
  applyBucketChangeWithRollback, archiveBucket, bucketLedgerRows, createBucket, listBuckets,
  moveChildBucket, queryBucketDetail, queryUnassignedTransactions, reorderBucket, restoreBucket, updateBucket
} from '../js/services/bucketService.js';
import {createStateService} from '../js/services/stateService.js';
import {createVaultRepository} from '../js/services/vaultRepository.js';
import {installBrowserGlobals} from './helpers.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/v1-buckets.json', import.meta.url), 'utf8'));
const now = '2026-07-31T12:00:00.000Z';
const migrated = () => migrateState(fixture, {now}).state;

beforeEach(() => installBrowserGlobals());

function canonicalTransaction(id, amountCents, overrides = {}) {
  return {
    id, accountId:'unknown-account', source:'migration', sourceTransactionId:null, rawName:`Record ${id}`,
    merchantName:`Record ${id}`, amountCents, currency:'USD', authorizedAt:null, postedAt:'2026-07-24',
    displayDate:'2026-07-24', pendingStatus:'posted', movementType:'expense', reviewStatus:'reviewed',
    locationRegion:null, locationCountry:null, locationSource:null, providerCategory:null, manualOverrides:null,
    createdAt:now, updatedAt:now, ...overrides
  };
}

function allocation(id, transactionId, bucketId, subBucketId, amountCents) {
  return {id, transactionId, bucketId, subBucketId, amountCents, ownershipType:'personal', note:null, reimbursementClaimId:null, createdAt:now, updatedAt:now};
}

function assertProjection(state, id) {
  const canonical = state.domain.buckets.find(item => item.id === id);
  const compatibility = state.review.buckets.find(item => item.id === id);
  assert.ok(canonical, `missing canonical bucket ${id}`);
  assert.ok(compatibility, `missing compatibility bucket ${id}`);
  assert.deepEqual({
    id:compatibility.id, parentId:compatibility.parentId ?? null, name:compatibility.name, group:compatibility.group,
    order:compatibility.order, target:compatibility.target, protected:compatibility.protected,
    active:compatibility.active, archivedAt:compatibility.archivedAt ?? null, description:compatibility.description ?? null
  }, {
    id:canonical.id, parentId:canonical.parentId, name:canonical.name, group:canonical.group,
    order:canonical.order, target:canonical.targetCents / 100, protected:canonical.protected,
    active:canonical.active, archivedAt:canonical.archivedAt, description:canonical.description
  });
}

test('acceptance: V1 categories and totals migrate one-for-one without mutation or speculative children', () => {
  const source = structuredClone(fixture);
  const before = structuredClone(source);
  const first = migrateState(source, {now});
  const second = migrateState(first.state, {now});

  assert.deepEqual(source, before);
  assert.equal(first.state.domain.buckets.length, source.categories.length);
  for (const category of source.categories) {
    const bucket = first.state.domain.buckets.find(item => item.id === category.id);
    assert.ok(bucket);
    assert.equal(bucket.parentId, null);
    assert.equal(bucket.name, category.name);
    assert.equal(bucket.order, category.order);
    assert.equal(bucket.targetCents, Math.round(category.target * 100));
    assert.equal(bucket.active, category.active !== false && !category.archivedAt);
    assert.equal(first.state.domain.legacyMonthlySnapshots[0].bucketActualsCents[category.id], Math.round(category.actual * 100));
  }
  assert.deepEqual(first.state.legacyV1.categories, source.categories);
  assert.deepEqual(first.state.review.transactions, source.review.transactions);
  assert.deepEqual(first.state.review.merchantRules, source.review.merchantRules);
  assert.equal(first.state.domain.buckets.some(item => item.parentId), false);
  assert.equal(validateFoundationDomain(first.state.domain).ok, true);
  assert.equal(second.changed, false);
  assert.deepEqual(second.state, first.state);

  const traceableBefore = source.review.transactions.filter(item => item.bucketId === 'food').reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
  assert.equal(queryBucketDetail(first.state, 'food').rolledUpCents, traceableBefore);
  assert.equal(queryBucketDetail(first.state, 'travel').legacyAggregateCents, 4500);
  assert.equal(queryBucketDetail(first.state, 'travel').rows.length, 0);
});

test('acceptance: canonical identity wins once while legacy-only, canonical-only, archived-child, and unassigned rows remain available', () => {
  const state = migrated();
  createBucket(state, {parentId:'food', name:'Child'}, {id:'food-child', now});
  state.domain.transactions=state.domain.transactions.filter(item=>item.id!=='legacy-food-1');
  state.domain.allocations=state.domain.allocations.filter(item=>item.transactionId!=='legacy-food-1');
  state.review.transactions.push({id:'legacy-only', date:'2026-07-23', merchant:'Legacy only', amount:5, account:'Checking', flow:'outflow', bucketId:'food', reviewStatus:'pending'});
  state.domain.transactions.push(
    canonicalTransaction('legacy-food-1', -1234, {rawName:'Canonical duplicate', merchantName:'Canonical duplicate', postedAt:'2026-07-20', displayDate:'2026-07-20'}),
    canonicalTransaction('canonical-only', -700, {rawName:'Canonical only', merchantName:'Canonical only'}),
    canonicalTransaction('canonical-unassigned', -300)
  );
  state.domain.allocations.push(
    allocation('allocation-duplicate', 'legacy-food-1', 'food', 'food-child', 1234),
    allocation('allocation-canonical-only', 'canonical-only', 'food', null, 700)
  );

  const rows = bucketLedgerRows(state);
  assert.equal(rows.filter(row => row.transactionId === 'legacy-food-1').length, 1);
  assert.equal(rows.find(row => row.transactionId === 'legacy-food-1').source, 'canonical-allocation');
  assert.equal(rows.some(row => row.transactionId === 'legacy-only' && row.source === 'legacy-v1-assignment'), true);
  assert.equal(rows.some(row => row.transactionId === 'canonical-only' && row.source === 'canonical-allocation'), true);

  const parent = queryBucketDetail(state, 'food');
  assert.equal(parent.directCents, 1200);
  assert.equal(parent.rolledUpCents, 2434);
  assert.equal(parent.childTotals[0].amountCents, 1234);
  assert.equal(parent.transactionCount, 3);
  assert.equal(parent.rows.reduce((sum, row) => sum + row.amountCents, 0), parent.rolledUpCents);

  const child = queryBucketDetail(state, 'food-child');
  assert.deepEqual(child.rows.map(row => row.transactionId), ['legacy-food-1']);
  assert.equal(child.rolledUpCents, 1234);
  assert.equal(child.rows.reduce((sum, row) => sum + row.amountCents, 0), child.rolledUpCents);

  assert.equal(queryBucketDetail(state, 'food', {assignment:'direct'}).rolledUpCents, 1200);
  assert.equal(queryBucketDetail(state, 'food', {assignment:'child'}).rolledUpCents, 1234);
  assert.equal(queryBucketDetail(state, 'food', {search:'Canonical only'}).rolledUpCents, 700);
  assert.equal(queryBucketDetail(state, 'food', {accountId:'legacy-account:checking'}).rolledUpCents, 500);
  assert.equal(queryBucketDetail(state, 'food', {reviewStatus:'unreviewed'}).rolledUpCents, 500);
  assert.equal(queryBucketDetail(state, 'food-child', {from:'2026-07-21'}).rows.length, 0);

  archiveBucket(state, 'food-child', {now});
  assert.equal(queryBucketDetail(state, 'food').rolledUpCents, 2434);
  assert.equal(queryBucketDetail(state, 'food-child').rolledUpCents, 1234);

  const unassigned = queryUnassignedTransactions(state);
  assert.equal(unassigned.some(row => row.transactionId === 'legacy-unassigned'), true);
  assert.equal(unassigned.some(row => row.transactionId === 'canonical-unassigned'), true);
});

test('acceptance: compatibility projection stays synchronized through every bucket mutation and encrypted reload', async () => {
  const state = migrated();
  createBucket(state, {name:'New parent', group:'Wants', target:90}, {id:'new-parent', now});
  assertProjection(state, 'new-parent');
  updateBucket(state, 'new-parent', {name:'Renamed parent', description:'Acceptance'}, {now});
  assertProjection(state, 'new-parent');
  reorderBucket(state, 'new-parent', 'up', {now});
  assertProjection(state, 'new-parent');
  createBucket(state, {parentId:'food', name:'First child'}, {id:'first-child', now});
  createBucket(state, {parentId:'food', name:'Second child'}, {id:'second-child', now});
  reorderBucket(state, 'second-child', 'up', {now});
  assertProjection(state, 'first-child');
  assertProjection(state, 'second-child');
  archiveBucket(state, 'first-child', {now});
  assertProjection(state, 'first-child');
  restoreBucket(state, 'first-child', {now});
  assertProjection(state, 'first-child');
  moveChildBucket(state, 'first-child', 'travel', {now});
  assertProjection(state, 'first-child');
  assert.equal(state.review.transactions[0].bucketId, 'food');

  const passphrase = 'acceptance projection passphrase';
  const service = createStateService({repository:createVaultRepository(), seed:fixture});
  const created = await service.create(passphrase, state);
  const unlocked = await service.unlock(passphrase);
  for (const id of ['new-parent', 'first-child', 'second-child']) assertProjection(unlocked.state, id);
  assert.deepEqual(unlocked.state.review.transactions, state.review.transactions);
});

test('acceptance: failed persistence rolls back canonical and compatibility state together and leaves the encrypted vault valid', async () => {
  const passphrase = 'acceptance rollback passphrase';
  const service = createStateService({repository:createVaultRepository(), seed:fixture});
  const created = await service.create(passphrase, fixture);
  const state = created.state;
  const before = structuredClone(state);

  await assert.rejects(() => applyBucketChangeWithRollback(
    state,
    () => createBucket(state, {parentId:'food', name:'Must roll back'}, {id:'rollback-child', now}),
    async () => { throw new Error('simulated save failure'); }
  ), /simulated save failure/);
  assert.deepEqual(state, before);

  await assert.rejects(() => applyBucketChangeWithRollback(
    state,
    () => reorderBucket(state, 'food', 'up', {now}),
    async () => { throw new Error('simulated reorder failure'); }
  ), /simulated reorder failure/);
  assert.deepEqual(state, before);

  const unlocked = await service.unlock(passphrase);
  assert.deepEqual(unlocked.state, before);
  assert.equal(validateFoundationDomain(unlocked.state.domain).ok, true);
});

test('acceptance: successful canonical bucket persistence advances the state revision exactly once', async () => {
  const state = migrated();
  let saves = 0;
  await applyBucketChangeWithRollback(
    state,
    () => createBucket(state, {parentId:'food', name:'Revision child'}, {id:'revision-child', now}),
    async () => { saves += 1; }
  );
  assert.equal(saves, 1);
  assert.equal(state.stateRevision, 1);
});

test('acceptance: invalid hierarchy, identifiers, sibling names, cycles, and malformed migrated buckets fail without partial mutation', () => {
  const state = migrated();
  createBucket(state, {parentId:'food', name:'Child'}, {id:'food-child', now});
  const before = structuredClone(state);

  assert.throws(() => createBucket(state, {parentId:'missing-parent', name:'Orphan'}, {now}), error => error.code === 'NOT_FOUND');
  assert.throws(() => createBucket(state, {parentId:'food-child', name:'Grandchild'}, {now}), error => error.code === 'MAX_DEPTH');
  assert.throws(() => createBucket(state, {parentId:'food', name:' child '}, {now}), error => error.code === 'DUPLICATE_NAME');
  assert.throws(() => updateBucket(state, 'missing-id', {name:'Missing'}, {now}), error => error.code === 'NOT_FOUND');
  assert.throws(() => moveChildBucket(state, 'food-child', 'food-child', {now}), error => error.code === 'MAX_DEPTH');
  assert.deepEqual(state, before);

  const cycle = structuredClone(state.domain.buckets.slice(0, 2));
  cycle[0].parentId = cycle[1].id;
  cycle[1].parentId = cycle[0].id;
  assert.equal(validateBucketTree(cycle).ok, false);

  const malformed = migrated();
  malformed.schemaVersion = 4;
  malformed.domain.buckets[0].order = 1.5;
  assert.throws(() => migrateState(malformed, {now}), /Pre-migration state failed foundation validation/);
});
