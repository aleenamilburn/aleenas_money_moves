import assert from 'node:assert/strict';
import test from 'node:test';
import {STATE_SCHEMA_VERSION} from '../js/domain/constants.js';
import {upgradeStateWithMigration} from '../js/state.js';
import {legacyV1State} from './helpers.js';

function seed() {
  return {
    schemaVersion:3,
    app:{name:'Money Moves', tagline:'Monthly Snapshot', version:'2.0.0-foundation.1'},
    preferences:{lockMinutes:60, showScripture:true, monthlyIncome:4200},
    monthly:{activeMonth:'2026-07', selectedMonth:'2026-07', lastOpenedMonth:'2026-07'},
    providerSnapshot:{asOf:'2026-07-28', averageMonthlyIncome:4200, accounts:[], recurring:[]},
    review:{
      buckets:[{id:'groceries', name:'Groceries', group:'Needs', target:300, system:false, order:1, protected:false}],
      transactions:[],
      merchantRules:[],
      importSettings:{positiveMeansSpend:true, includeMoneyMovement:true}
    },
    travel:{visited:[], destinations:[]},
    scriptures:[{reference:'Example', text:'Example', theme:'Example'}]
  };
}

test('V1 UI state is hydrated into the current schema without removing V1 categories', () => {
  const v1 = legacyV1State();
  v1.review.transactions = [{id:'legacy-tx-1', date:'2026-07-30', merchant:'Market', amount:12, account:'Checking', flow:'outflow', providerPayloadRef:'keep-this'}];
  v1.travel.destinations = [{city:'Legacy City', state:'VA', bestMonths:[7], baseScore:1, est:1, work:'Unknown', internet:'Unknown', access:'Unknown', why:'Preserved V1 destination'}];
  const original = structuredClone(v1);
  const result = upgradeStateWithMigration(v1, seed(), {now:'2026-07-31T00:00:00.000Z'});

  assert.deepEqual(v1, original);
  assert.equal(result.state.schemaVersion, STATE_SCHEMA_VERSION);
  assert.equal(result.state.app.name, 'Money Moves');
  assert.deepEqual(result.state.categories, original.categories);
  assert.deepEqual(result.state.legacyV1.categories, original.categories);
  assert.equal(result.state.review.buckets.some(bucket => bucket.id === 'groceries'), true);
  assert.equal(result.state.review.importSettings.positiveMeansSpend, true);
  assert.equal(result.state.domain.legacyMonthlySnapshots.length, 1);
  assert.equal(result.state.review.transactions[0].providerPayloadRef, 'keep-this');
  assert.deepEqual(result.state.travel.destinations, original.travel.destinations);
});

test('migration preserves custom V1 rules, debts, goals, preferences, and monthly history without injecting seed data', () => {
  const v1 = legacyV1State();
  v1.preferences = {...v1.preferences, preferredCurrency:'CAD', customPreference:{keep:true}};
  v1.debts = [{id:'debt-1', lender:'Legacy lender', balance:99, customDebtField:'retain'}];
  v1.goals = [{id:'goal-1', name:'Legacy goal', target:500, customGoalField:'retain'}];
  v1.monthly.history = {'2026-06':{actuals:{groceries:25}, customMonthlyField:'retain'}};
  v1.travel.destinations = [];
  v1.providerSnapshot = {asOf:'2026-07-28', customSnapshotField:'retain'};
  v1.review.transactions = [{id:'legacy-tx', date:'2026-07-28', merchant:'Legacy market', amount:1, flow:'outflow', account:null, customTransactionField:'retain'}];
  v1.review.merchantRules = [
    {merchant:'Legacy market', merchantKey:'legacy market', bucketId:'groceries', customRuleField:'retain'},
    {merchant:'Unresolved', merchantKey:'unresolved', bucketId:'missing-bucket', customRuleField:'preserve-in-legacy'}
  ];
  const seeded = seed();
  seeded.providerSnapshot.accounts = [{id:'seed-account', name:'Must not be added'}];
  seeded.providerSnapshot.recurring = [{merchant:'Seed recurring'}];
  seeded.review.transactions = [{id:'seed-transaction', date:'2026-07-01', merchant:'Must not be added', amount:1, account:'Seed', flow:'outflow'}];
  seeded.travel.destinations = [{city:'Seed City', state:'ZZ'}];

  const result = upgradeStateWithMigration(v1, seeded, {now:'2026-07-31T00:00:00.000Z'}).state;

  assert.deepEqual(result.preferences.customPreference, {keep:true});
  assert.deepEqual(result.debts, v1.debts);
  assert.deepEqual(result.goals, v1.goals);
  assert.deepEqual(result.monthly.history, v1.monthly.history);
  assert.equal(result.providerSnapshot.customSnapshotField, 'retain');
  assert.deepEqual(result.providerSnapshot.accounts, []);
  assert.deepEqual(result.providerSnapshot.recurring, []);
  assert.deepEqual(result.travel.destinations, []);
  assert.equal(result.review.transactions.length, 1);
  assert.equal(result.review.transactions[0].customTransactionField, 'retain');
  assert.equal(result.review.transactions[0].account, 'Unknown account');
  assert.equal(result.review.merchantRules[0].customRuleField, 'retain');
  assert.equal(result.legacyV1.unresolvedMerchantRules[0].customRuleField, 'preserve-in-legacy');
});

test('legacy UI hydration is deterministic for unkeyed rules and incomplete transactions', () => {
  const v1 = legacyV1State();
  v1.providerSnapshot = {};
  v1.review.transactions = [{merchant:'No date merchant', amount:4, flow:'outflow'}];
  v1.review.merchantRules = [{merchant:'No id rule', bucketId:'groceries'}];
  const options = {now:'2026-07-31T00:00:00.000Z'};

  const first = upgradeStateWithMigration(v1, seed(), options).state;
  const second = upgradeStateWithMigration(v1, seed(), options).state;

  assert.deepEqual(first, second);
  assert.equal(first.review.transactions[0].date, '2026-07-31');
  assert.equal(first.review.transactions[0].account, 'Unknown account');
});

test('legacy UI hydration uses the migration timestamp when no transaction can select a week', () => {
  const v1 = legacyV1State();
  v1.providerSnapshot = {};
  v1.review.transactions = [];
  v1.review.selectedWeek = null;
  const options = {now:'2026-07-31T00:00:00.000Z'};

  const first = upgradeStateWithMigration(v1, seed(), options).state;
  const second = upgradeStateWithMigration(v1, seed(), options).state;

  assert.deepEqual(first, second);
  assert.equal(first.review.selectedWeek, '2026-07-27');
});
