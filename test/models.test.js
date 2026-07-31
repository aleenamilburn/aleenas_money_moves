import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertValid,
  validateAccount,
  validateAllocation,
  validateAllocationsForTransaction,
  validateBucket,
  validateBucketTree,
  validateDomainStore,
  validateMerchantRule,
  validateReimbursementClaim,
  validateTransaction
} from '../js/domain/models.js';

const createdAt = '2026-07-31T00:00:00.000Z';
const updatedAt = '2026-07-31T00:01:00.000Z';

function account() {
  return {id:'account-1', institutionId:null, externalAccountId:'manual-checking-1', friendlyName:'Checking', officialName:null, mask:'1234', type:'cash', subtype:null, currency:'USD', source:'manual', active:true, balanceCents:2500, createdAt, updatedAt};
}

function transaction() {
  return {id:'transaction-1', accountId:'account-1', source:'manual', sourceTransactionId:null, rawName:'Market', merchantName:'Market', amountCents:-1250, currency:'USD', authorizedAt:null, postedAt:'2026-07-30', displayDate:'2026-07-30', pendingStatus:'posted', movementType:'expense', reviewStatus:'reviewed', locationRegion:null, locationCountry:null, locationSource:null, providerCategory:null, manualOverrides:{merchantName:'Market'}, createdAt, updatedAt};
}

function bucket(id, parentId = null) {
  return {id, parentId, name:id, group:'Needs', order:0, targetCents:1000, protected:false, active:true, createdAt, updatedAt};
}

function allocation(id, amountCents) {
  return {id, transactionId:'transaction-1', bucketId:'groceries', subBucketId:null, amountCents, ownershipType:'personal', note:null, reimbursementClaimId:null, createdAt, updatedAt};
}

test('runtime validators accept each V2 foundation model', () => {
  const claim = {id:'claim-1', payerLabel:'Roommate', expectedAmountCents:500, status:'open', dueDate:null, note:null, allocationIds:['allocation-1'], repaymentLinks:[], createdAt, updatedAt};
  const rule = {id:'rule-1', merchantKey:'market', conditions:{merchantKey:'market'}, action:{bucketId:'groceries'}, active:true, lastUsedAt:null, matchCount:0, createdAt, updatedAt};

  for (const result of [
    validateAccount(account()),
    validateTransaction(transaction()),
    validateBucket(bucket('groceries')),
    validateAllocation(allocation('allocation-1', 1250)),
    validateReimbursementClaim(claim),
    validateMerchantRule(rule)
  ]) assert.equal(result.ok, true, result.errors.join('; '));
});

test('runtime validators reject invalid money and incomplete transactions', () => {
  const invalid = transaction();
  invalid.amountCents = -12.5;
  invalid.accountId = '';
  const result = validateTransaction(invalid);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /safe integer/);
  assert.throws(() => assertValid(result), /Transaction is invalid/);
});

test('bucket depth and allocation totals are enforced', () => {
  const roots = [bucket('parent'), bucket('child', 'parent'), bucket('grandchild', 'child')];
  const tree = validateBucketTree(roots);
  assert.equal(tree.ok, false);
  assert.match(tree.errors.join(' '), /third nesting level/);

  const allocations = validateAllocationsForTransaction([allocation('a-1', 700), allocation('a-2', 550)], -1250);
  assert.equal(allocations.ok, true, allocations.errors.join('; '));
  const invalid = validateAllocationsForTransaction([allocation('a-1', 700)], -1250);
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(' '), /must equal transaction magnitude/);
});

test('domain store validation rejects broken references before persistence', () => {
  const domain = {
    accounts:[account()],
    transactions:[transaction()],
    buckets:[bucket('groceries')],
    allocations:[allocation('allocation-1', 1250)],
    reimbursementClaims:[],
    merchantRules:[]
  };
  assert.equal(validateDomainStore(domain).ok, true);
  domain.allocations[0].bucketId = 'missing-bucket';
  const result = validateDomainStore(domain);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /missing bucket/);
});

test('domain relationships support child buckets, reimbursement allocations, and linked reimbursement inflows', () => {
  const expense = transaction();
  const repayment = {...transaction(), id:'transaction-2', amountCents:1250, movementType:'reimbursement', merchantName:'Roommate repayment'};
  const parent = bucket('travel');
  const child = bucket('lodging', 'travel');
  const reimbursable = {...allocation('allocation-1', 1250), bucketId:'travel', subBucketId:'lodging', ownershipType:'reimbursable', reimbursementClaimId:'claim-1'};
  const claim = {
    id:'claim-1', payerLabel:'Roommate', expectedAmountCents:1250, status:'open', dueDate:null, note:null,
    allocationIds:['allocation-1'], repaymentLinks:[{transactionId:'transaction-2', amountCents:1250}], createdAt, updatedAt
  };
  const domain = {
    accounts:[account()], transactions:[expense, repayment], buckets:[parent, child], allocations:[reimbursable],
    reimbursementClaims:[claim], merchantRules:[{
      id:'rule-1', merchantKey:'roommate', conditions:{merchantKey:'roommate'}, action:{bucketId:'travel'},
      active:true, lastUsedAt:null, matchCount:0, createdAt, updatedAt
    }]
  };

  assert.equal(validateDomainStore(domain).ok, true);
  domain.merchantRules[0].action.bucketId = 'missing-bucket';
  const invalidRule = validateDomainStore(domain);
  assert.equal(invalidRule.ok, false);
  assert.match(invalidRule.errors.join(' '), /targets missing bucket/);
  domain.merchantRules[0].action.bucketId = 'travel';
  domain.allocations.push({...reimbursable});
  const duplicate = validateDomainStore(domain);
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.errors.join(' '), /duplicate id/);
});
