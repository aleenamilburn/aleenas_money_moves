import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {STARTER_SPENDING_BUCKETS, SYSTEM_BUCKET_IDS} from '../js/domain/constants.js';
import {migrateState} from '../js/domain/migrations.js';
import {createUnknownAccount, validateBucket} from '../js/domain/models.js';
import {deleteBucket, createBucket, updateBucket} from '../js/services/bucketService.js';
import {saveAllocationDraft, validateAllocationDraft} from '../js/services/allocationService.js';
import {reviewAssignmentTarget, reviewChildrenForParent, reviewParentBuckets} from '../js/services/reviewAssignment.js';
import {availableMonths, monthKey, monthSummary, upgradeStateWithMigration, weekStart} from '../js/state.js';

const now = '2026-08-05T12:00:00.000Z';

function emptySchema7() {
  return {
    schemaVersion:7, stateRevision:0, preferences:{monthlyIncome:0}, monthly:{selectedMonth:'', activeMonth:'', lastOpenedMonth:''},
    review:{buckets:[], transactions:[], merchantRules:[], importSettings:{}},
    domain:{accounts:[], transactions:[], buckets:[], allocations:[], reimbursementClaims:[], reimbursementClaimAllocations:[], reimbursementPaymentLinks:[], reimbursementAdjustments:[], merchantRules:[], auditEvents:[], legacyMonthlySnapshots:[], legacyBalanceSnapshots:[]}
  };
}

function seed() {
  return {
    schemaVersion:3, app:{name:'Money Moves'}, preferences:{monthlyIncome:0}, monthly:{selectedMonth:'', activeMonth:'', lastOpenedMonth:''},
    review:{buckets:[], transactions:[], merchantRules:[], importSettings:{}}, providerSnapshot:{accounts:[]}, travel:{visited:[], destinations:[]}, scriptures:[]
  };
}

function transaction(id, amountCents, date = '2026-08-05') {
  return {
    id, accountId:'unknown-account', source:'manual', sourceTransactionId:null, rawName:id, merchantName:id,
    amountCents, currency:'USD', authorizedAt:null, postedAt:date, displayDate:date, pendingStatus:'posted',
    movementType:amountCents > 0 ? 'other_inflow' : 'expense', reviewStatus:'pending', locationRegion:null,
    locationCountry:null, locationSource:null, providerCategory:null, manualOverrides:null, createdAt:now, updatedAt:now
  };
}

function fresh() {
  return migrateState(emptySchema7(), {now}).state;
}

test('schema 8 creates ordinary starter buckets only for an originally empty vault and never name-converts existing buckets', () => {
  const state = fresh();
  assert.deepEqual(state.domain.buckets.filter(bucket => !bucket.system).map(bucket => bucket.id), STARTER_SPENDING_BUCKETS.map(bucket => bucket.id));
  assert.deepEqual(state.domain.buckets.filter(bucket => bucket.system).map(bucket => bucket.id), Object.values(SYSTEM_BUCKET_IDS));
  assert.equal(state.domain.buckets.filter(bucket => !bucket.system).every(bucket => bucket.parentId === null && bucket.semanticType === 'spending'), true);
  assert.deepEqual(migrateState(state, {now}).state, state);

  const existing = emptySchema7();
  existing.review.buckets.push({id:'user-income', name:'Income', group:'User choice', target:0, order:0, active:true});
  existing.review.transactions.push({id:'existing-transaction', date:'2026-08-01', merchant:'Existing', amount:1, account:'Checking', flow:'outflow', reviewStatus:'pending'});
  const migrated = migrateState(existing, {now}).state;
  assert.equal(migrated.domain.buckets.some(bucket => bucket.id === 'mm-starter-housing'), false);
  assert.equal(migrated.domain.buckets.find(bucket => bucket.id === 'user-income').semanticType, 'spending');
  assert.equal(migrated.domain.buckets.filter(bucket => bucket.system).length, 3);
});

test('schema 8 recognizes only the structural unknown account as fresh evidence and preserves all other V1 content', () => {
  const initialized = emptySchema7();
  initialized.domain.accounts.push(createUnknownAccount(now));
  const migrated = migrateState(initialized, {now}).state;
  assert.deepEqual(migrated.domain.buckets.filter(bucket => !bucket.system).map(bucket => bucket.id), STARTER_SPENDING_BUCKETS.map(bucket => bucket.id));
  assert.deepEqual(migrateState(migrated, {now}).state, migrated, 'migration is idempotent after starters are present');

  const legacyContent = emptySchema7();
  legacyContent.debts = [{id:'debt-1', name:'Preserve me'}];
  const preserved = migrateState(legacyContent, {now}).state;
  assert.equal(preserved.domain.buckets.some(bucket => bucket.id === 'mm-starter-housing'), false);
  assert.deepEqual(preserved.debts, legacyContent.debts);
});

test('schema 8 rejects partial classifications and turns schema 7 forward fields into ordinary user buckets', () => {
  const partial = {
    id:'user-income', parentId:null, name:'Income', group:'User choice', order:0, targetCents:0,
    protected:false, semanticType:'income', system:false, active:true, description:null, archivedAt:null, createdAt:now, updatedAt:now
  };
  const legacy = emptySchema7();
  legacy.domain.buckets.push(partial);
  const migrated = migrateState(legacy, {now}).state;
  assert.equal(migrated.domain.buckets.find(bucket => bucket.id === partial.id).semanticType, 'spending');
  assert.equal(validateBucket({...migrated.domain.buckets.find(bucket => bucket.id === SYSTEM_BUCKET_IDS.income), system:false}).ok, false);
  assert.equal(validateBucket({...partial, schemaVersion:8}).ok, false);

  const collision = emptySchema7();
  collision.domain.buckets.push({...partial, id:SYSTEM_BUCKET_IDS.income, semanticType:undefined});
  assert.throws(() => migrateState(collision, {now}), /reserved system bucket id/);
});

test('system classifications are protected, while starter buckets remain ordinary editable buckets', () => {
  const state = fresh();
  const income = SYSTEM_BUCKET_IDS.income;
  assert.throws(() => updateBucket(state, income, {name:'Paychecks'}, {now}), error => error.code === 'SYSTEM_CLASSIFICATION');
  assert.throws(() => updateBucket(state, income, {semanticType:'spending'}, {now}), error => error.code === 'SEMANTIC_TYPE_IMMUTABLE');
  assert.throws(() => updateBucket(state, income, {system:false}, {now}), error => error.code === 'SYSTEM_CLASSIFICATION_IMMUTABLE');
  assert.throws(() => deleteBucket(state, income), error => error.code === 'PROTECTED');
  assert.throws(() => createBucket(state, {parentId:income, name:'Child'}, {now}), error => error.code === 'SYSTEM_CLASSIFICATION');
  updateBucket(state, 'mm-starter-food', {name:'Groceries and dining'}, {now});
  assert.equal(state.domain.buckets.find(bucket => bucket.id === 'mm-starter-food').name, 'Groceries and dining');
});

test('weekly review exposes only parents and requires an explicit child target without changing the transaction first', () => {
  const state = fresh();
  createBucket(state, {parentId:'mm-starter-food', name:'Groceries'}, {now});
  const parents = reviewParentBuckets(state);
  assert.equal(parents.some(bucket => bucket.parentId), false);
  assert.deepEqual(reviewChildrenForParent(state, 'mm-starter-food').map(bucket => bucket.name), ['Groceries']);
  const target = reviewAssignmentTarget(state, 'mm-starter-food');
  assert.equal(target.children.length, 1);
  assert.equal(state.domain.allocations.length, 0, 'opening or cancelling the child chooser has no persistence side effect');
});

test('classification and parent rollup totals are allocation-traceable and do not double count', async () => {
  const state = fresh();
  const food = 'mm-starter-food';
  const dining = createBucket(state, {parentId:food, name:'Dining'}, {now});
  state.domain.transactions.push(transaction('food-direct', -1000), transaction('food-child', -600), transaction('income', 500), transaction('transfer', -200), transaction('debt', -300));
  const persist = async () => {};
  await saveAllocationDraft(state, 'food-direct', [{id:'a-food-direct', bucketId:food, subBucketId:null, amountCents:1000, ownershipType:'mine', note:''}], persist, {now, markReviewed:true});
  await saveAllocationDraft(state, 'food-child', [{id:'a-food-child', bucketId:food, subBucketId:dining, amountCents:600, ownershipType:'mine', note:''}], persist, {now, markReviewed:true});
  await saveAllocationDraft(state, 'income', [{id:'a-income', bucketId:SYSTEM_BUCKET_IDS.income, subBucketId:null, amountCents:500, ownershipType:'mine', note:''}], persist, {now, markReviewed:true});
  await saveAllocationDraft(state, 'transfer', [{id:'a-transfer', bucketId:SYSTEM_BUCKET_IDS.transfer, subBucketId:null, amountCents:200, ownershipType:'mine', note:''}], persist, {now, markReviewed:true});
  await saveAllocationDraft(state, 'debt', [{id:'a-debt', bucketId:SYSTEM_BUCKET_IDS.debtPayment, subBucketId:null, amountCents:300, ownershipType:'mine', note:''}], persist, {now, markReviewed:true});
  const summary = monthSummary(state, '2026-08');
  assert.equal(summary.actuals[food], 16);
  assert.equal(summary.actuals[dining], 6);
  assert.equal(summary.spend, 16);
  assert.equal(summary.income, 5);
  assert.equal(summary.debtPayments, 3);
  assert.equal(summary.cashFlow, -14);
  assert.equal(state.domain.transactions.find(item => item.id === 'transfer').movementType, 'internal_transfer');
  assert.equal(state.domain.transactions.find(item => item.id === 'debt').movementType, 'debt_payment');
  const invalid = validateAllocationDraft(state, 'income', [
    {id:'split-income-a', bucketId:SYSTEM_BUCKET_IDS.income, subBucketId:null, amountCents:200, ownershipType:'mine', note:''},
    {id:'split-income-b', bucketId:food, subBucketId:null, amountCents:300, ownershipType:'mine', note:''}
  ]);
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(' '), /one full transaction classification/);
});

test('month hydration uses a controlled local clock and never selects migration fallback January 1970', () => {
  const currentDate = new Date(2026, 7, 5, 12);
  const state = upgradeStateWithMigration(emptySchema7(), seed(), {now, currentDate}).state;
  assert.equal(state.monthly.selectedMonth, '2026-08');
  assert.equal(monthKey(currentDate), '2026-08');
  assert.equal(weekStart('2026-08-05'), '2026-08-03');
  assert.deepEqual(availableMonths(state, {clock:currentDate}), ['2026-08']);
  state.monthly.selectedMonth = '2026-07';
  const rehydrated = upgradeStateWithMigration(state, seed(), {now, currentDate}).state;
  assert.equal(rehydrated.monthly.selectedMonth, '2026-07', 'an explicit valid historical selection persists');
});

test('Weekly Review separates the split editor action from parent-first bucket choices without changing its interaction contract', () => {
  const markup = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
  const renderer = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const actionStart = markup.indexOf('class="review-transaction-actions"');
  const choices = markup.indexOf('id="reviewBucketChoices"', actionStart);
  const splitButton = markup.indexOf('id="editCurrentAllocation"', actionStart);

  assert.ok(actionStart >= 0, 'review actions must be grouped explicitly');
  assert.ok(choices > actionStart && splitButton > choices, 'bucket choices stay primary and the split action follows them');
  assert.match(markup, /<div class="review-secondary-actions">\s*<button type="button" id="editCurrentAllocation">Split or edit allocation<\/button>/);
  assert.match(styles, /\.review-transaction-actions\{display:grid;gap:16px;margin-top:20px\}/);
  assert.match(styles, /\.review-secondary-actions\{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding-top:14px;border-top:1px solid var\(--line\)\}/);
  assert.match(styles, /\.review-secondary-actions #editCurrentAllocation\{width:auto;min-width:15rem\}/);
  assert.match(styles, /@media\(max-width:760px\)\{\.app-shell\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(styles, /@media\(max-width:760px\).*\.review-secondary-actions #editCurrentAllocation\{width:100%;min-width:0\}/);
  assert.match(renderer, /\$\('editCurrentAllocation'\)\.onclick=\(\)=>openAllocationEditor\(tx\.id,'review'\)/);
  assert.match(renderer, /transactionAllocationSummary\(state,tx\.id\)\.status === 'split'[\s\S]*?openAllocationEditor\(tx\.id,'review'\)/);
});
