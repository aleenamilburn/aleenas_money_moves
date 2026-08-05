const createdAt = '2026-07-30T12:00:00.000Z';
const updatedAt = '2026-07-30T12:05:00.000Z';

const clone = value => JSON.parse(JSON.stringify(value));

function account() {
  return {
    id:'synthetic-account', institutionId:null, externalAccountId:null, friendlyName:'Synthetic account',
    officialName:null, mask:null, type:'cash', subtype:null, currency:'USD', source:'manual', active:true,
    balanceCents:null, createdAt, updatedAt
  };
}

function transaction(id, amountCents, {currency = 'USD', movementType = amountCents > 0 ? 'reimbursement' : 'expense'} = {}) {
  return {
    id, accountId:'synthetic-account', source:'manual', sourceTransactionId:null, rawName:'Synthetic transaction',
    merchantName:null, amountCents, currency, authorizedAt:null, postedAt:'2026-07-30', displayDate:'2026-07-30',
    pendingStatus:'posted', movementType, reviewStatus:'reviewed', locationRegion:null, locationCountry:null,
    locationSource:null, providerCategory:null, manualOverrides:null, createdAt, updatedAt
  };
}

function allocation(id, transactionId, amountCents, {ownershipType = 'reimbursable', reimbursementClaimId = null} = {}) {
  return {
    id, transactionId, bucketId:'synthetic-bucket', subBucketId:null, amountCents, ownershipType, note:null,
    reimbursementClaimId, createdAt, updatedAt
  };
}

function claim(id, allocationIds, expectedAmountCents, overrides = {}) {
  return {
    id, payerLabel:'Synthetic payer', expectedAmountCents, status:'open', dueDate:null, note:null,
    allocationIds, repaymentLinks:[], createdAt, updatedAt, ...overrides
  };
}

export function emptySchema6ReimbursementState() {
  return {
    schemaVersion:6,
    app:{name:'Money Moves', version:'2.0.0-foundation.1'},
    preferences:{monthlyIncome:1000, customPreference:{preserve:true}},
    monthly:{selectedMonth:'2026-07', history:{'2026-06':{preserve:true}}},
    providerSnapshot:{asOf:'2026-07-30'},
    review:{transactions:[], buckets:[], merchantRules:[], importSettings:{}},
    travel:{visited:[], destinations:[{city:'Synthetic City', state:'ZZ'}]},
    debts:[{id:'synthetic-debt', preserve:true}],
    goals:[{id:'synthetic-goal', preserve:true}],
    migration:{appliedMigrations:[
      'v1-preserve-legacy-state', 'v2-foundation-domain-store', 'v2-foundation-canonical-name',
      'v2a-bucket-explorer-fields', 'v2a-transaction-allocations'
    ]},
    domain:{
      accounts:[account()], transactions:[], buckets:[{
        id:'synthetic-bucket', parentId:null, name:'Synthetic bucket', group:'Needs', order:0, targetCents:0,
        protected:false, active:true, description:null, archivedAt:null, createdAt, updatedAt
      }],
      allocations:[], reimbursementClaims:[], merchantRules:[], auditEvents:[],
      legacyMonthlySnapshots:[], legacyBalanceSnapshots:[]
    }
  };
}

function singleClaimState({
  expectedAmountCents = 500,
  allocationAmountCents = 1000,
  ownershipType = 'reimbursable',
  pointer = 'claim-single',
  transactionCurrency = 'USD',
  claimOverrides = {}
} = {}) {
  const state = emptySchema6ReimbursementState();
  state.domain.transactions.push(transaction('expense-single', -allocationAmountCents, {currency:transactionCurrency, movementType:'expense'}));
  state.domain.allocations.push(allocation('allocation-single', 'expense-single', allocationAmountCents, {
    ownershipType, reimbursementClaimId:pointer
  }));
  state.domain.reimbursementClaims.push(claim('claim-single', ['allocation-single'], expectedAmountCents, claimOverrides));
  return state;
}

function multiClaimState(expectedAmountCents = 1000) {
  const state = emptySchema6ReimbursementState();
  state.domain.transactions.push(transaction('expense-multi', -1000, {movementType:'expense'}));
  state.domain.allocations.push(
    allocation('allocation-multi-a', 'expense-multi', 400, {reimbursementClaimId:'claim-multi'}),
    allocation('allocation-multi-b', 'expense-multi', 600, {reimbursementClaimId:'claim-multi'})
  );
  state.domain.reimbursementClaims.push(claim('claim-multi', ['allocation-multi-a', 'allocation-multi-b'], expectedAmountCents));
  return state;
}

function withRepayment(state, repayment, transactionOptions = {}) {
  const amount = Number.isSafeInteger(repayment.amountCents) && repayment.amountCents !== 0 ? repayment.amountCents : 500;
  state.domain.transactions.push(transaction(repayment.transactionId, amount, transactionOptions));
  state.domain.reimbursementClaims[0].repaymentLinks.push(repayment);
  return state;
}

export const schema6ReimbursementFixtures = {
  empty:() => emptySchema6ReimbursementState(),
  safeSingle:() => singleClaimState(),
  safeMulti:() => multiClaimState(),
  ambiguousMulti:() => multiClaimState(700),
  missingAllocation:() => {
    const state = emptySchema6ReimbursementState();
    state.domain.reimbursementClaims.push(claim('claim-missing', ['allocation-missing'], 500));
    return state;
  },
  pointerDisagreement:() => singleClaimState({pointer:'different-claim'}),
  pointerOnlyOnClaim:() => singleClaimState({pointer:null}),
  pointerOnlyOnAllocation:() => {
    const state = singleClaimState();
    state.domain.reimbursementClaims[0].allocationIds = [];
    return state;
  },
  nonReimbursable:() => singleClaimState({ownershipType:'mine'}),
  expectedExceedsAllocation:() => singleClaimState({expectedAmountCents:1200}),
  unknownCurrency:() => singleClaimState({transactionCurrency:null}),
  malformedCurrency:() => singleClaimState({transactionCurrency:'usd'}),
  mixedCurrencies:() => {
    const state = emptySchema6ReimbursementState();
    state.domain.transactions.push(
      transaction('expense-usd', -400, {currency:'USD', movementType:'expense'}),
      transaction('expense-eur', -600, {currency:'EUR', movementType:'expense'})
    );
    state.domain.allocations.push(
      allocation('allocation-usd', 'expense-usd', 400, {reimbursementClaimId:'claim-mixed'}),
      allocation('allocation-eur', 'expense-eur', 600, {reimbursementClaimId:'claim-mixed'})
    );
    state.domain.reimbursementClaims.push(claim('claim-mixed', ['allocation-usd', 'allocation-eur'], 1000));
    return state;
  },
  safeRepayment:() => withRepayment(singleClaimState(), {transactionId:'repayment-safe', amountCents:500}),
  duplicateRepayments:() => {
    const state = withRepayment(singleClaimState(), {transactionId:'repayment-duplicate', amountCents:250});
    state.domain.transactions.find(item => item.id === 'repayment-duplicate').amountCents = 500;
    state.domain.reimbursementClaims[0].repaymentLinks.push({transactionId:'repayment-duplicate', amountCents:250});
    return state;
  },
  malformedRepaymentFragment:() => {
    const state = singleClaimState();
    state.domain.reimbursementClaims[0].repaymentLinks.push(null);
    return state;
  },
  missingRepaymentTransaction:() => {
    const state = singleClaimState();
    state.domain.reimbursementClaims[0].repaymentLinks.push({transactionId:'repayment-missing', amountCents:100});
    return state;
  },
  invalidRepaymentAmount:() => withRepayment(singleClaimState(), {transactionId:'repayment-zero', amountCents:0}),
  wrongRepaymentDirection:() => {
    const state = singleClaimState();
    state.domain.transactions.push(transaction('repayment-outflow', -100, {movementType:'reimbursement'}));
    state.domain.reimbursementClaims[0].repaymentLinks.push({transactionId:'repayment-outflow', amountCents:100});
    return state;
  },
  repaymentWrongType:() => withRepayment(singleClaimState(), {transactionId:'repayment-other', amountCents:100}, {movementType:'other_inflow'}),
  repaymentsExceedClaim:() => {
    const state = singleClaimState();
    state.domain.transactions.push(
      transaction('repayment-a', 300),
      transaction('repayment-b', 300)
    );
    state.domain.reimbursementClaims[0].repaymentLinks.push(
      {transactionId:'repayment-a', amountCents:300},
      {transactionId:'repayment-b', amountCents:300}
    );
    return state;
  },
  inflowOverAppliedAcrossClaims:() => {
    const state = emptySchema6ReimbursementState();
    state.domain.transactions.push(
      transaction('expense-a', -600, {movementType:'expense'}),
      transaction('expense-b', -600, {movementType:'expense'}),
      transaction('shared-inflow', 1000)
    );
    state.domain.allocations.push(
      allocation('allocation-a', 'expense-a', 600, {reimbursementClaimId:'claim-a'}),
      allocation('allocation-b', 'expense-b', 600, {reimbursementClaimId:'claim-b'})
    );
    state.domain.reimbursementClaims.push(
      claim('claim-a', ['allocation-a'], 600, {repaymentLinks:[{transactionId:'shared-inflow', amountCents:600}]}),
      claim('claim-b', ['allocation-b'], 600, {repaymentLinks:[{transactionId:'shared-inflow', amountCents:600}]})
    );
    return state;
  },
  contradictoryStatus:() => singleClaimState({claimOverrides:{status:'settled'}}),
  sharedAndExcludedOwnership:() => {
    const state = emptySchema6ReimbursementState();
    state.domain.transactions.push(transaction('expense-legacy-ownership', -1000, {movementType:'expense'}));
    state.domain.allocations.push(
      allocation('allocation-shared', 'expense-legacy-ownership', 500, {ownershipType:'shared', reimbursementClaimId:'claim-shared'}),
      allocation('allocation-excluded', 'expense-legacy-ownership', 500, {ownershipType:'excluded', reimbursementClaimId:'claim-excluded'})
    );
    state.domain.reimbursementClaims.push(
      claim('claim-shared', ['allocation-shared'], 500),
      claim('claim-excluded', ['allocation-excluded'], 500)
    );
    return state;
  },
  invalidCancellationEvidence:() => singleClaimState({claimOverrides:{status:'cancelled', cancelledAt:null, cancellationReason:null}}),
  validCancellationEvidence:() => singleClaimState({claimOverrides:{
    status:'cancelled', cancelledAt:'2026-07-30T13:00:00.000Z', cancellationReason:'Synthetic cancellation'
  }}),
  existingAuditEvents:() => {
    const state = singleClaimState();
    state.domain.auditEvents.push({
      id:'audit-existing', entityType:'reimbursement_claim', entityId:'claim-single', action:'legacy_reviewed',
      relatedEntityIds:['allocation-single'], occurredAt:createdAt, source:'migration', reason:null,
      monetaryFacts:{expectedAmountCents:500}, operationGroupId:null
    });
    return state;
  },
  unresolvedMigrationAudit:() => {
    const state = singleClaimState({pointer:'different-claim'});
    state.domain.auditEvents.push({
      id:'audit-unresolved-conversion', entityType:'reimbursement_claim', entityId:'claim-single', action:'converted',
      relatedEntityIds:['allocation-single'], occurredAt:createdAt, source:'migration', reason:null,
      monetaryFacts:{expectedAmountCents:500}, operationGroupId:null
    });
    return state;
  },
  relationshipIdCollision:() => {
    const state = emptySchema6ReimbursementState();
    state.domain.transactions.push(transaction('expense-collision', -1000, {movementType:'expense'}));
    state.domain.allocations.push(
      allocation('c1z2edalkfvr9', 'expense-collision', 400, {reimbursementClaimId:'claim-collision'}),
      allocation('c1cbjpyqe0765l', 'expense-collision', 600, {reimbursementClaimId:'claim-collision'})
    );
    state.domain.reimbursementClaims.push(claim(
      'claim-collision', ['c1z2edalkfvr9', 'c1cbjpyqe0765l'], 1000
    ));
    return state;
  },
  duplicateIdentifiers:() => {
    const state = emptySchema6ReimbursementState();
    state.domain.transactions.push(transaction('expense-duplicates', -1000, {movementType:'expense'}));
    state.domain.allocations.push(
      allocation('allocation-duplicate-a', 'expense-duplicates', 500, {reimbursementClaimId:'claim-duplicate'}),
      allocation('allocation-duplicate-b', 'expense-duplicates', 500, {reimbursementClaimId:'claim-duplicate'})
    );
    state.domain.reimbursementClaims.push(
      claim('claim-duplicate', ['allocation-duplicate-a'], 500),
      claim('claim-duplicate', ['allocation-duplicate-b'], 500)
    );
    return state;
  },
  futureSchema:() => {
    const state = emptySchema6ReimbursementState();
    state.schemaVersion = 9;
    return state;
  }
};

export function cloneSchema6Fixture(name) {
  const factory = schema6ReimbursementFixtures[name];
  if (!factory) throw new Error(`Unknown schema-6 reimbursement fixture: ${name}`);
  return clone(factory());
}
