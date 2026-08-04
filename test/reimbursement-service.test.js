import assert from 'node:assert/strict';
import test from 'node:test';
import {migrateState} from '../js/domain/migrations.js';
import {UNKNOWN_ACCOUNT_ID} from '../js/domain/constants.js';
import {validateDomainStore} from '../js/domain/models.js';
import {createStateService} from '../js/services/stateService.js';
import {createVaultRepository} from '../js/services/vaultRepository.js';
import {
  REIMBURSEMENT_ERROR_CODES,
  aggregateOutstandingReimbursement,
  applyPaymentDistribution,
  cancelClaim,
  createClaim,
  createClaimAmountsDraft,
  createClaimDraft,
  createClaimMetadataDraft,
  createManualRepaymentDraft,
  createPaymentDistributionDraft,
  createWriteOff,
  createWriteOffDraft,
  projectCancelledClaims,
  projectClaim,
  projectClaimsNeedingResolution,
  projectInflowAvailability,
  projectOpenClaims,
  projectSettledClaims,
  projectUnmatchedReimbursementInflows,
  recordManualRepayment,
  reverseWriteOff,
  updateClaimAmounts,
  updateClaimMetadata,
  validateClaimDraft,
  validateClaimAmountsDraft,
  validatePaymentDistribution,
  voidPaymentLink
} from '../js/services/reimbursementService.js';
import {schema6ReimbursementFixtures as fixtures} from './fixtures/schema6-reimbursements.js';
import {currentFakeVaultsTable, installBrowserGlobals, TEST_USER_ID} from './helpers.js';
import {setSupabaseClientForTests} from '../js/services/supabaseClient.js';

const now = '2026-07-31T12:00:00.000Z';
const later = '2026-08-01T12:00:00.000Z';

function stateFrom(name = 'empty') {
  return migrateState(fixtures[name](), {now}).state;
}

let idSequence = 0;
function ids() {
  return prefix => `${prefix}-${++idSequence}`;
}

function options(at = now) {
  return {now:at, idFactory:ids()};
}

function addExpense(state, id, amountCents, {currency = 'USD', ownershipType = 'reimbursable'} = {}) {
  const transactionId = `expense-${id}`;
  const allocationId = `allocation-${id}`;
  state.domain.transactions.push({
    id:transactionId, accountId:'synthetic-account', source:'manual', sourceTransactionId:null,
    rawName:'Synthetic expense', merchantName:null, amountCents:-amountCents, currency,
    authorizedAt:null, postedAt:'2026-07-30', displayDate:'2026-07-30', pendingStatus:'posted',
    movementType:'expense', reviewStatus:'reviewed', locationRegion:null, locationCountry:null,
    locationSource:null, providerCategory:null, manualOverrides:null, createdAt:now, updatedAt:now
  });
  state.domain.allocations.push({
    id:allocationId, transactionId, bucketId:'synthetic-bucket', subBucketId:null, amountCents,
    ownershipType, note:null, reimbursementClaimId:null, createdAt:now, updatedAt:now
  });
  return allocationId;
}

function addInflow(state, id, amountCents, {currency = 'USD', movementType = 'reimbursement', date = '2026-07-31'} = {}) {
  const transactionId = `inflow-${id}`;
  state.domain.transactions.push({
    id:transactionId, accountId:'synthetic-account', source:'manual', sourceTransactionId:null,
    rawName:'Synthetic inflow', merchantName:null, amountCents, currency,
    authorizedAt:null, postedAt:date, displayDate:date, pendingStatus:'posted', movementType,
    reviewStatus:'reviewed', locationRegion:null, locationCountry:null, locationSource:null,
    providerCategory:null, manualOverrides:null, createdAt:now, updatedAt:now
  });
  return transactionId;
}

async function makeClaim(state, rows, overrides = {}) {
  const draft = createClaimDraft(state, {payerLabel:'Housemate', rows, ...overrides});
  return createClaim(state, draft, async () => {}, options());
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, error => error?.code === code);
}

test('claim drafts are pure and validate single, multi-allocation, partial, and unsafe claim facts', () => {
  const state = stateFrom();
  const one = addExpense(state, 'one', 1000);
  const two = addExpense(state, 'two', 600);
  const before = structuredClone(state);
  const draft = createClaimDraft(state, {payerLabel:'Housemate', rows:[{allocationId:one, amountCents:450}, {allocationId:two}]});
  const result = validateClaimDraft(state, draft);

  assert.deepEqual(state, before);
  assert.equal(draft.expectedRevision, 0);
  assert.equal(result.ok, true);
  assert.equal(result.expectedAmountCents, 1050);
  assert.equal(result.currency, 'USD');
  assert.equal(validateClaimDraft(state, {...draft, payerLabel:' '}).errors[0].code, REIMBURSEMENT_ERROR_CODES.INVALID_PAYER_LABEL);
  assert.equal(validateClaimDraft(state, {...draft, rows:[{allocationId:one, amountCents:1001}]}).errors[0].code, REIMBURSEMENT_ERROR_CODES.CLAIM_AMOUNT_EXCEEDS_ALLOCATION);
  state.domain.allocations.find(item => item.id === two).ownershipType = 'mine';
  assert.equal(validateClaimDraft(state, {...draft, rows:[{allocationId:two, amountCents:1}]}).errors[0].code, REIMBURSEMENT_ERROR_CODES.ALLOCATION_NOT_REIMBURSABLE);
});

test('claim creation persists once, advances one revision, uses strong injected IDs, and groups compact audit facts', async () => {
  const state = stateFrom();
  const first = addExpense(state, 'first', 700);
  const second = addExpense(state, 'second', 300);
  const draft = createClaimDraft(state, {payerLabel:'Housemate', rows:[{allocationId:first, amountCents:500}, {allocationId:second, amountCents:250}]});
  let saves = 0;
  const claim = await createClaim(state, draft, async () => { saves += 1; }, options());

  assert.equal(saves, 1);
  assert.equal(state.stateRevision, 1);
  assert.equal(claim.expectedAmountCents, 750);
  assert.equal(claim.status, 'open');
  assert.equal(state.domain.reimbursementClaimAllocations.length, 2);
  assert.equal(new Set(state.domain.auditEvents.map(item => item.operationGroupId)).size, 1);
  assert.equal(JSON.stringify(state.domain.auditEvents).includes('Housemate'), false);
  assert.equal(validateDomainStore(state.domain).ok, true);
});

test('competing claims, mixed currency, stale drafts, and failed persistence leave no partial claim facts', async () => {
  const state = stateFrom();
  const usd = addExpense(state, 'usd', 500);
  const eur = addExpense(state, 'eur', 500, {currency:'EUR'});
  const mixed = createClaimDraft(state, {payerLabel:'Payer', rows:[{allocationId:usd}, {allocationId:eur}]});
  assert.equal(validateClaimDraft(state, mixed).errors[0].code, REIMBURSEMENT_ERROR_CODES.MIXED_CURRENCY);

  const stale = createClaimDraft(state, {payerLabel:'Payer', allocationIds:[usd]});
  state.stateRevision += 1;
  const beforeStale = structuredClone(state);
  await rejectsCode(createClaim(state, stale, async () => assert.fail('must not persist'), options()), REIMBURSEMENT_ERROR_CODES.STALE_STATE);
  assert.deepEqual(state, beforeStale);

  const fresh = createClaimDraft(state, {payerLabel:'Payer', allocationIds:[usd]});
  const beforeFailure = structuredClone(state);
  await rejectsCode(createClaim(state, fresh, async () => { throw new Error('synthetic storage error'); }, options()), REIMBURSEMENT_ERROR_CODES.PERSISTENCE_FAILED);
  assert.deepEqual(state, beforeFailure);

  await makeClaim(state, [{allocationId:usd, amountCents:500}]);
  assert.throws(
    () => createClaimDraft(state, {payerLabel:'Other', allocationIds:[usd]}),
    error => error?.code === REIMBURSEMENT_ERROR_CODES.ALLOCATION_ALREADY_CLAIMED
  );
});

test('metadata editing changes no money facts and audit records field names without sensitive values', async () => {
  const state = stateFrom();
  const allocationId = addExpense(state, 'metadata', 500);
  const created = await makeClaim(state, [{allocationId, amountCents:400}]);
  const beforeMoney = projectClaim(state, created.id);
  const draft = createClaimMetadataDraft(state, created.id);
  draft.payerLabel = 'Updated payer';
  draft.note = 'private note';
  draft.dueDate = '2026-08-20';
  const result = await updateClaimMetadata(state, draft, async () => {}, options(later));

  assert.equal(result.expectedAmountCents, beforeMoney.expectedAmountCents);
  assert.equal(result.remainingAmountCents, beforeMoney.remainingAmountCents);
  const event = state.domain.auditEvents.at(-1);
  assert.equal(event.reason, 'payerLabel,dueDate,note');
  assert.equal(JSON.stringify(event).includes('Updated payer'), false);
  assert.equal(JSON.stringify(event).includes('private note'), false);
});

test('amount editing retains relationship IDs, permits allocation changes, and blocks reductions below settled facts', async () => {
  const state = stateFrom();
  const one = addExpense(state, 'amount-one', 700);
  const two = addExpense(state, 'amount-two', 500);
  const claim = await makeClaim(state, [{allocationId:one, amountCents:600}]);
  const originalLinkId = state.domain.reimbursementClaimAllocations[0].id;
  const draft = createClaimAmountsDraft(state, claim.id);
  draft.rows[0].amountCents = 400;
  draft.rows.push({allocationId:two, amountCents:300});
  const updated = await updateClaimAmounts(state, draft, async () => {}, options(later));
  assert.equal(updated.expectedAmountCents, 700);
  assert.equal(updated.allocationLinks.find(item => item.allocationId === one).id, originalLinkId);

  const inflow = addInflow(state, 'settled-floor', 500);
  const payment = createPaymentDistributionDraft(state, inflow, {rows:[{claimId:claim.id, amountCents:500}]});
  await applyPaymentDistribution(state, payment, async () => {}, options(later));
  const tooLow = createClaimAmountsDraft(state, claim.id);
  tooLow.rows = [{allocationId:one, amountCents:400}];
  assert.equal(validateClaimAmountsDraft(state, tooLow).errors[0].code, REIMBURSEMENT_ERROR_CODES.CLAIM_AMOUNT_BELOW_SETTLED_FACTS);
  const before = structuredClone(state);
  await rejectsCode(updateClaimAmounts(state, tooLow, async () => {}, options(later)), REIMBURSEMENT_ERROR_CODES.CLAIM_AMOUNT_BELOW_SETTLED_FACTS);
  assert.deepEqual(state, before);
});

test('cancellation preserves claim and relationship evidence while enforcing active-payment and write-off restrictions', async () => {
  const state = stateFrom();
  const allocationId = addExpense(state, 'cancel', 500);
  const claim = await makeClaim(state, [{allocationId, amountCents:500}]);
  const cancelled = await cancelClaim(state, {claimId:claim.id, reason:'Created in error', expectedRevision:state.stateRevision}, async () => {}, options(later));
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(state.domain.reimbursementClaimAllocations.length, 0);
  assert.equal(state.domain.auditEvents.some(item => item.action === 'claim_allocation_removed_on_cancellation'), true);
  await rejectsCode(cancelClaim(state, {claimId:claim.id, reason:'Again', expectedRevision:state.stateRevision}, async () => {}, options(later)), REIMBURSEMENT_ERROR_CODES.CLAIM_ALREADY_CANCELLED);

  const stateWithPayment = stateFrom();
  const allocation2 = addExpense(stateWithPayment, 'cancel-payment', 500);
  const claim2 = await makeClaim(stateWithPayment, [{allocationId:allocation2, amountCents:500}]);
  const inflow = addInflow(stateWithPayment, 'cancel-payment', 100);
  await applyPaymentDistribution(stateWithPayment, createPaymentDistributionDraft(stateWithPayment, inflow, {rows:[{claimId:claim2.id, amountCents:100}]}), async () => {}, options(later));
  await rejectsCode(cancelClaim(stateWithPayment, {claimId:claim2.id, reason:'No', expectedRevision:stateWithPayment.stateRevision}, async () => {}, options(later)), REIMBURSEMENT_ERROR_CODES.ACTIVE_PAYMENTS_PREVENT_CANCELLATION);
});

test('write-offs and reversals append immutable facts, honor chronology, and never create cash movement', async () => {
  const state = stateFrom();
  const allocationId = addExpense(state, 'writeoff', 800);
  const claim = await makeClaim(state, [{allocationId, amountCents:800}]);
  const transactionCount = state.domain.transactions.length;
  const draft = createWriteOffDraft(state, claim.id, {amountCents:300, reason:'Uncollectible', effectiveAt:'2026-08-01T00:00:00.000Z'});
  const partial = await createWriteOff(state, draft, async () => {}, options(later));
  assert.equal(partial.writtenOffAmountCents, 300);
  assert.equal(partial.remainingAmountCents, 500);
  assert.equal(state.domain.transactions.length, transactionCount);

  const adjustmentId = state.domain.reimbursementAdjustments[0].id;
  const reversed = await reverseWriteOff(state, {adjustmentId, amountCents:300, reason:'Collection resumed', effectiveAt:'2026-08-02T00:00:00.000Z', expectedRevision:state.stateRevision}, async () => {}, options('2026-08-02T12:00:00.000Z'));
  assert.equal(reversed.writtenOffAmountCents, 0);
  assert.equal(reversed.remainingAmountCents, 800);
  await rejectsCode(reverseWriteOff(state, {adjustmentId, reason:'Again', expectedRevision:state.stateRevision}, async () => {}, options('2026-08-03T12:00:00.000Z')), REIMBURSEMENT_ERROR_CODES.WRITE_OFF_ALREADY_REVERSED);
});

test('one inflow distributes atomically across claims and preserves visible overpayment excess', async () => {
  const state = stateFrom();
  const firstAllocation = addExpense(state, 'distribution-one', 500);
  const secondAllocation = addExpense(state, 'distribution-two', 600);
  const first = await makeClaim(state, [{allocationId:firstAllocation, amountCents:500}]);
  const second = await makeClaim(state, [{allocationId:secondAllocation, amountCents:600}]);
  const inflow = addInflow(state, 'distribution', 1200);
  const draft = createPaymentDistributionDraft(state, inflow, {rows:[{claimId:first.id, amountCents:500}, {claimId:second.id, amountCents:400}]});
  const validation = validatePaymentDistribution(state, draft);
  assert.equal(validation.ok, true);
  assert.equal(validation.remainingInflowAmountCents, 300);
  let saves = 0;
  const result = await applyPaymentDistribution(state, draft, async () => { saves += 1; }, options(later));
  assert.equal(saves, 1);
  assert.equal(result.links.length, 2);
  assert.equal(result.inflow.availableAmountCents, 300);
  assert.equal(result.claims[0].status, 'settled');
  assert.equal(result.claims[1].status, 'partially_paid');
  assert.equal(new Set(state.domain.auditEvents.slice(-2).map(item => item.operationGroupId)).size, 1);
});

test('payment validation rejects cross-currency, duplicate, claim-overage, and inflow-overage without mutation', async () => {
  const state = stateFrom();
  const usdAllocation = addExpense(state, 'pay-usd', 500);
  const eurAllocation = addExpense(state, 'pay-eur', 500, {currency:'EUR'});
  const usdClaim = await makeClaim(state, [{allocationId:usdAllocation, amountCents:500}]);
  const eurClaim = await makeClaim(state, [{allocationId:eurAllocation, amountCents:500}]);
  const inflow = addInflow(state, 'pay', 400);
  assert.equal(validatePaymentDistribution(state, createPaymentDistributionDraft(state, inflow, {rows:[{claimId:eurClaim.id, amountCents:100}]})).errors[0].code, REIMBURSEMENT_ERROR_CODES.MIXED_CURRENCY);
  assert.equal(validatePaymentDistribution(state, createPaymentDistributionDraft(state, inflow, {rows:[{claimId:usdClaim.id, amountCents:501}]})).errors[0].code, REIMBURSEMENT_ERROR_CODES.PAYMENT_EXCEEDS_CLAIM);
  assert.equal(validatePaymentDistribution(state, createPaymentDistributionDraft(state, inflow, {rows:[{claimId:usdClaim.id, amountCents:401}]})).errors[0].code, REIMBURSEMENT_ERROR_CODES.PAYMENT_EXCEEDS_INFLOW);
  const duplicateRows = createPaymentDistributionDraft(state, inflow, {rows:[{claimId:usdClaim.id, amountCents:100}, {claimId:usdClaim.id, amountCents:100}]});
  assert.equal(validatePaymentDistribution(state, duplicateRows).errors[0].code, REIMBURSEMENT_ERROR_CODES.DUPLICATE_PAYMENT_CLAIM);
  const before = structuredClone(state);
  await rejectsCode(applyPaymentDistribution(state, {...duplicateRows, expectedRevision:state.stateRevision}, async () => {}, options()), REIMBURSEMENT_ERROR_CODES.DUPLICATE_PAYMENT_CLAIM);
  assert.deepEqual(state, before);
});

test('failed multi-payment persistence and stale distributions restore the complete prior state', async () => {
  const state = stateFrom();
  const allocationId = addExpense(state, 'rollback-payment', 500);
  const claim = await makeClaim(state, [{allocationId, amountCents:500}]);
  const inflow = addInflow(state, 'rollback-payment', 500);
  const draft = createPaymentDistributionDraft(state, inflow, {rows:[{claimId:claim.id, amountCents:300}]});
  const beforeFailure = structuredClone(state);
  await rejectsCode(applyPaymentDistribution(state, draft, async () => { throw new Error('synthetic'); }, options(later)), REIMBURSEMENT_ERROR_CODES.PERSISTENCE_FAILED);
  assert.deepEqual(state, beforeFailure);
  state.stateRevision += 1;
  const beforeStale = structuredClone(state);
  await rejectsCode(applyPaymentDistribution(state, draft, async () => assert.fail('must not persist'), options(later)), REIMBURSEMENT_ERROR_CODES.STALE_STATE);
  assert.deepEqual(state, beforeStale);
});

test('voiding a payment retains history, restores both availabilities, and requires one active void', async () => {
  const state = stateFrom();
  const allocationId = addExpense(state, 'void', 500);
  const claim = await makeClaim(state, [{allocationId, amountCents:500}]);
  const inflow = addInflow(state, 'void', 500);
  const applied = await applyPaymentDistribution(state, createPaymentDistributionDraft(state, inflow, {rows:[{claimId:claim.id, amountCents:300}]}), async () => {}, options(later));
  const result = await voidPaymentLink(state, {paymentLinkId:applied.links[0].id, reason:'Incorrect match', expectedRevision:state.stateRevision}, async () => {}, options('2026-08-02T12:00:00.000Z'));
  assert.equal(result.link.voidedAt, '2026-08-02T12:00:00.000Z');
  assert.equal(result.claim.remainingAmountCents, 500);
  assert.equal(result.inflow.availableAmountCents, 500);
  assert.equal(state.domain.reimbursementPaymentLinks.length, 1);
  await rejectsCode(voidPaymentLink(state, {paymentLinkId:applied.links[0].id, reason:'Again', expectedRevision:state.stateRevision}, async () => {}, options()), REIMBURSEMENT_ERROR_CODES.PAYMENT_ALREADY_VOIDED);
});

test('manual repayment atomically creates a reimbursement inflow with explicit or unknown account and never fabricates location', async () => {
  for (const accountId of ['synthetic-account', UNKNOWN_ACCOUNT_ID]) {
    const state = stateFrom();
    const allocationId = addExpense(state, `manual-${accountId}`, 500);
    const claim = await makeClaim(state, [{allocationId, amountCents:500}]);
    const draft = createManualRepaymentDraft(state, claim.id, {amountCents:250, date:'2026-08-03', accountId, note:'Recorded by user'});
    const beforeTransactions = state.domain.transactions.length;
    const result = await recordManualRepayment(state, draft, async () => {}, options('2026-08-03T12:00:00.000Z'));
    assert.equal(state.domain.transactions.length, beforeTransactions + 1);
    assert.equal(result.transaction.accountId, accountId);
    assert.equal(result.transaction.movementType, 'reimbursement');
    assert.equal(result.transaction.locationRegion, null);
    assert.equal(result.transaction.locationCountry, null);
    assert.equal(result.transaction.merchantName, null);
    assert.equal(result.claim.receivedAmountCents, 250);
    assert.equal(new Set(state.domain.auditEvents.slice(-2).map(item => item.operationGroupId)).size, 1);
  }
});

test('manual repayment rejects fabricated accounts and rolls back transaction, link, audit, and revision on save failure', async () => {
  const state = stateFrom();
  const allocationId = addExpense(state, 'manual-rollback', 500);
  const claim = await makeClaim(state, [{allocationId, amountCents:500}]);
  const invalid = createManualRepaymentDraft(state, claim.id, {amountCents:100, date:'2026-08-03', accountId:'missing-account'});
  await rejectsCode(recordManualRepayment(state, invalid, async () => {}, options()), REIMBURSEMENT_ERROR_CODES.INVALID_ACCOUNT);
  const draft = createManualRepaymentDraft(state, claim.id, {amountCents:100, date:'2026-08-03', accountId:UNKNOWN_ACCOUNT_ID});
  const before = structuredClone(state);
  await rejectsCode(recordManualRepayment(state, draft, async () => { throw new Error('synthetic'); }, options()), REIMBURSEMENT_ERROR_CODES.PERSISTENCE_FAILED);
  assert.deepEqual(state, before);
});

test('read projections are pure, temporal, separate unresolved evidence, and aggregate authoritative cents only', async () => {
  const state = stateFrom('ambiguousMulti');
  const allocationId = addExpense(state, 'projection', 500);
  const claim = await makeClaim(state, [{allocationId, amountCents:500}], {dueDate:'2026-07-31'});
  const inflow = addInflow(state, 'projection', 700, {date:'2026-08-10'});
  const before = structuredClone(state);
  assert.equal(projectClaim(state, claim.id, {asOf:'2026-08-01'}).isOverdue, true);
  assert.equal(projectInflowAvailability(state, inflow, {asOf:'2026-08-01'}).availableAmountCents, 0);
  assert.equal(projectUnmatchedReimbursementInflows(state, {asOf:'2026-08-11'})[0].availableAmountCents, 700);
  assert.equal(projectOpenClaims(state, {asOf:'2026-08-01'}).length, 1);
  assert.equal(projectSettledClaims(state).length, 0);
  assert.equal(projectCancelledClaims(state).length, 0);
  assert.equal(projectClaimsNeedingResolution(state).length, 1);
  assert.equal(Object.hasOwn(projectClaimsNeedingResolution(state)[0], 'expectedAmountCents'), false);
  assert.deepEqual(aggregateOutstandingReimbursement(state, {asOf:'2026-08-01'}), {outstandingAmountCents:500, claimCount:1, asOf:'2026-08-01'});
  assert.deepEqual(state, before);
});

test('schema-7 migration initializes revision once and preserves it idempotently', () => {
  const first = migrateState(fixtures.empty(), {now});
  const repeated = migrateState(first.state, {now});
  assert.equal(first.state.stateRevision, 0);
  assert.equal(repeated.state.stateRevision, 0);
  assert.deepEqual(repeated.state, first.state);
  assert.throws(() => migrateState({...first.state, stateRevision:-1}, {now}), /stateRevision/);
});

test('every reimbursement mutation survives sequential encrypted save and reload with revision and legacy evidence intact', async () => {
  installBrowserGlobals();
  const seed = stateFrom('ambiguousMulti');
  const allocationA = addExpense(seed, 'vault-a', 600);
  const allocationB = addExpense(seed, 'vault-b', 300);
  const inflow = addInflow(seed, 'vault', 500);
  const stateService = createStateService({repository:createVaultRepository(), seed});
  const passphrase = 'phase 3b encrypted service test';
  const created = await stateService.create(passphrase, seed);
  const state = created.state;
  let meta = created.meta;
  const persist = async () => { meta = (await stateService.save(state, created.key, meta)).meta; };

  const claim = await createClaim(state, createClaimDraft(state, {payerLabel:'Vault payer', rows:[{allocationId:allocationA, amountCents:500}]}), persist, options());
  const metadata = createClaimMetadataDraft(state, claim.id);
  metadata.dueDate = '2026-08-15';
  await updateClaimMetadata(state, metadata, persist, options(later));
  const amounts = createClaimAmountsDraft(state, claim.id);
  amounts.rows[0].amountCents = 450;
  await updateClaimAmounts(state, amounts, persist, options(later));
  const payment = await applyPaymentDistribution(state, createPaymentDistributionDraft(state, inflow, {rows:[{claimId:claim.id, amountCents:100}]}), persist, options(later));
  await voidPaymentLink(state, {paymentLinkId:payment.links[0].id, reason:'Vault correction', expectedRevision:state.stateRevision}, persist, options('2026-08-02T12:00:00.000Z'));
  const writeOff = createWriteOffDraft(state, claim.id, {amountCents:50, reason:'Vault write-off', effectiveAt:'2026-08-02T12:00:00.000Z'});
  await createWriteOff(state, writeOff, persist, options('2026-08-02T12:00:00.000Z'));
  const adjustmentId = state.domain.reimbursementAdjustments.at(-1).id;
  await reverseWriteOff(state, {adjustmentId, reason:'Vault reversal', expectedRevision:state.stateRevision, effectiveAt:'2026-08-03T12:00:00.000Z'}, persist, options('2026-08-03T12:00:00.000Z'));
  await recordManualRepayment(state, createManualRepaymentDraft(state, claim.id, {amountCents:100, date:'2026-08-04', accountId:UNKNOWN_ACCOUNT_ID}), persist, options('2026-08-04T12:00:00.000Z'));
  const cancellable = await createClaim(state, createClaimDraft(state, {payerLabel:'Cancel payer', rows:[{allocationId:allocationB, amountCents:200}]}), persist, options('2026-08-05T12:00:00.000Z'));
  await cancelClaim(state, {claimId:cancellable.id, reason:'Vault cancellation', expectedRevision:state.stateRevision}, persist, options('2026-08-06T12:00:00.000Z'));

  const unlocked = await stateService.unlock(passphrase);
  assert.equal(unlocked.state.stateRevision, 10);
  assert.equal(projectClaim(unlocked.state, claim.id).receivedAmountCents, 100);
  assert.equal(projectClaim(unlocked.state, cancellable.id).status, 'cancelled');
  assert.equal(unlocked.state.domain.reimbursementPaymentLinks.length, 2);
  assert.equal(unlocked.state.domain.reimbursementAdjustments.length, 2);
  assert.equal(unlocked.state.legacyFoundation.unresolvedReimbursementClaims.length, 1);
  assert.equal(validateDomainStore(unlocked.state.domain).ok, true);
});

test('missing allocations, unknown currencies, and stale invalid claim drafts use stable errors without persistence', async () => {
  const state = stateFrom();
  assert.throws(
    () => createClaimDraft(state, {payerLabel:'Payer', allocationIds:['missing-allocation']}),
    error => error?.code === REIMBURSEMENT_ERROR_CODES.ALLOCATION_NOT_FOUND && !error.message.includes('Payer')
  );
  const allocationId = addExpense(state, 'unknown-currency', 500, {currency:null});
  assert.throws(
    () => createClaimDraft(state, {payerLabel:'Payer', allocationIds:[allocationId]}),
    error => error?.code === REIMBURSEMENT_ERROR_CODES.INVALID_CURRENCY && !error.message.includes('Payer')
  );
  state.domain.transactions.find(item => item.id === 'expense-unknown-currency').currency = 'USD';
  const draft = createClaimDraft(state, {payerLabel:'Payer', allocationIds:[allocationId]});
  draft.payerLabel = '';
  state.stateRevision += 1;
  let saves = 0;
  await rejectsCode(createClaim(state, draft, async () => { saves += 1; }, options()), REIMBURSEMENT_ERROR_CODES.STALE_STATE);
  assert.equal(saves, 0);
  assert.equal(state.domain.auditEvents.length, 0);
});

test('metadata and amount mutations reject stale drafts first and restore valid changes after persistence failure', async () => {
  const state = stateFrom();
  const first = addExpense(state, 'edit-rollback-one', 500);
  const second = addExpense(state, 'edit-rollback-two', 500);
  const claim = await makeClaim(state, [{allocationId:first, amountCents:400}]);
  const metadata = createClaimMetadataDraft(state, claim.id);
  metadata.payerLabel = '';
  state.stateRevision += 1;
  await rejectsCode(updateClaimMetadata(state, metadata, async () => assert.fail('must not persist'), options()), REIMBURSEMENT_ERROR_CODES.STALE_STATE);

  const currentMetadata = createClaimMetadataDraft(state, claim.id);
  currentMetadata.payerLabel = 'Replacement';
  const beforeMetadata = structuredClone(state);
  await rejectsCode(updateClaimMetadata(state, currentMetadata, async () => { throw new Error('synthetic'); }, options()), REIMBURSEMENT_ERROR_CODES.PERSISTENCE_FAILED);
  assert.deepEqual(state, beforeMetadata);

  const empty = createClaimAmountsDraft(state, claim.id);
  empty.rows = [];
  assert.equal(validateClaimAmountsDraft(state, empty).errors[0].code, REIMBURSEMENT_ERROR_CODES.FINAL_CLAIM_ALLOCATION_REQUIRED);
  const amounts = createClaimAmountsDraft(state, claim.id);
  amounts.rows.push({allocationId:second, amountCents:100});
  const beforeAmounts = structuredClone(state);
  await rejectsCode(updateClaimAmounts(state, amounts, async () => { throw new Error('synthetic'); }, options()), REIMBURSEMENT_ERROR_CODES.PERSISTENCE_FAILED);
  assert.deepEqual(state, beforeAmounts);
});

test('cancellation rejects active write-offs and rolls back cancellation evidence when persistence fails', async () => {
  const state = stateFrom();
  const allocationId = addExpense(state, 'cancel-writeoff', 500);
  const claim = await makeClaim(state, [{allocationId, amountCents:500}]);
  await createWriteOff(state, createWriteOffDraft(state, claim.id, {amountCents:100, reason:'Uncollectible', effectiveAt:later}), async () => {}, options(later));
  await rejectsCode(cancelClaim(state, {claimId:claim.id, reason:'No', expectedRevision:state.stateRevision}, async () => {}, options(later)), REIMBURSEMENT_ERROR_CODES.ACTIVE_WRITE_OFFS_PREVENT_CANCELLATION);

  const cleanState = stateFrom();
  const cleanAllocation = addExpense(cleanState, 'cancel-rollback', 500);
  const cleanClaim = await makeClaim(cleanState, [{allocationId:cleanAllocation, amountCents:500}]);
  const before = structuredClone(cleanState);
  await rejectsCode(cancelClaim(cleanState, {claimId:cleanClaim.id, reason:'Created in error', expectedRevision:cleanState.stateRevision}, async () => { throw new Error('synthetic'); }, options(later)), REIMBURSEMENT_ERROR_CODES.PERSISTENCE_FAILED);
  assert.deepEqual(cleanState, before);
});

test('write-off limits account for payments and full write-off derives written-off status with rollback safety', async () => {
  const state = stateFrom();
  const allocationId = addExpense(state, 'writeoff-limits', 500);
  const claim = await makeClaim(state, [{allocationId, amountCents:500}]);
  const inflow = addInflow(state, 'writeoff-limits', 200);
  await applyPaymentDistribution(state, createPaymentDistributionDraft(state, inflow, {rows:[{claimId:claim.id, amountCents:200}]}), async () => {}, options(later));
  const over = createWriteOffDraft(state, claim.id, {amountCents:301, reason:'Too much', effectiveAt:later});
  await rejectsCode(createWriteOff(state, over, async () => {}, options(later)), REIMBURSEMENT_ERROR_CODES.WRITE_OFF_EXCEEDS_REMAINING);
  const full = createWriteOffDraft(state, claim.id, {reason:'Uncollectible', effectiveAt:later});
  const writtenOff = await createWriteOff(state, full, async () => {}, options(later));
  assert.equal(writtenOff.status, 'written_off');
  assert.equal(writtenOff.writtenOffAmountCents, 300);
  assert.equal(projectSettledClaims(state).some(item => item.id === claim.id), true);

  const rollbackState = stateFrom();
  const rollbackAllocation = addExpense(rollbackState, 'writeoff-rollback', 500);
  const rollbackClaim = await makeClaim(rollbackState, [{allocationId:rollbackAllocation, amountCents:500}]);
  const rollbackDraft = createWriteOffDraft(rollbackState, rollbackClaim.id, {amountCents:100, reason:'Uncollectible', effectiveAt:later});
  const before = structuredClone(rollbackState);
  await rejectsCode(createWriteOff(rollbackState, rollbackDraft, async () => { throw new Error('synthetic'); }, options()), REIMBURSEMENT_ERROR_CODES.PERSISTENCE_FAILED);
  assert.deepEqual(rollbackState, before);
});

test('many payments settle one claim, exact duplicate links reject, and non-reimbursement inflows stay untouched', async () => {
  const state = stateFrom();
  const allocationId = addExpense(state, 'many-payments', 500);
  const claim = await makeClaim(state, [{allocationId, amountCents:500}]);
  const firstInflow = addInflow(state, 'many-one', 300);
  const secondInflow = addInflow(state, 'many-two', 200);
  const firstDraft = createPaymentDistributionDraft(state, firstInflow, {rows:[{claimId:claim.id, amountCents:300}]});
  await applyPaymentDistribution(state, firstDraft, async () => {}, options(later));
  const duplicate = createPaymentDistributionDraft(state, firstInflow, {rows:[{claimId:claim.id, amountCents:300}]});
  assert.equal(validatePaymentDistribution(state, duplicate).errors[0].code, REIMBURSEMENT_ERROR_CODES.DUPLICATE_PAYMENT_LINK);
  await applyPaymentDistribution(state, createPaymentDistributionDraft(state, secondInflow, {rows:[{claimId:claim.id, amountCents:200}]}), async () => {}, options(later));
  assert.equal(projectClaim(state, claim.id).status, 'settled');
  assert.equal(state.domain.reimbursementPaymentLinks.length, 2);

  const earned = addInflow(state, 'earned', 100, {movementType:'earned_income'});
  assert.throws(
    () => createPaymentDistributionDraft(state, earned, {rows:[{claimId:claim.id, amountCents:1}]}),
    error => error?.code === REIMBURSEMENT_ERROR_CODES.INVALID_REIMBURSEMENT_INFLOW
  );
});

test('void stale and persistence failures keep the original link active and create no audit event', async () => {
  const state = stateFrom();
  const allocationId = addExpense(state, 'void-rollback', 500);
  const claim = await makeClaim(state, [{allocationId, amountCents:500}]);
  const inflow = addInflow(state, 'void-rollback', 500);
  const applied = await applyPaymentDistribution(state, createPaymentDistributionDraft(state, inflow, {rows:[{claimId:claim.id, amountCents:100}]}), async () => {}, options(later));
  const staleRevision = state.stateRevision;
  state.stateRevision += 1;
  const beforeStale = structuredClone(state);
  await rejectsCode(voidPaymentLink(state, {paymentLinkId:applied.links[0].id, reason:'Incorrect', expectedRevision:staleRevision}, async () => assert.fail('must not persist'), options()), REIMBURSEMENT_ERROR_CODES.STALE_STATE);
  assert.deepEqual(state, beforeStale);
  const beforeFailure = structuredClone(state);
  await rejectsCode(voidPaymentLink(state, {paymentLinkId:applied.links[0].id, reason:'Incorrect', expectedRevision:state.stateRevision}, async () => { throw new Error('synthetic'); }, options()), REIMBURSEMENT_ERROR_CODES.PERSISTENCE_FAILED);
  assert.deepEqual(state, beforeFailure);
  assert.equal(state.domain.reimbursementPaymentLinks[0].voidedAt, null);
});

test('manual repayment enforces remaining amount and claim/account currency without classifying earned income', async () => {
  const state = stateFrom();
  const allocationId = addExpense(state, 'manual-boundary', 500, {currency:'EUR'});
  const claim = await makeClaim(state, [{allocationId, amountCents:500}]);
  const over = createManualRepaymentDraft(state, claim.id, {amountCents:501, date:'2026-08-01', accountId:UNKNOWN_ACCOUNT_ID});
  await rejectsCode(recordManualRepayment(state, over, async () => {}, options()), REIMBURSEMENT_ERROR_CODES.PAYMENT_EXCEEDS_CLAIM);
  const wrongAccount = createManualRepaymentDraft(state, claim.id, {amountCents:500, date:'2026-08-01', accountId:'synthetic-account'});
  await rejectsCode(recordManualRepayment(state, wrongAccount, async () => {}, options()), REIMBURSEMENT_ERROR_CODES.INVALID_ACCOUNT);
  state.domain.accounts.find(item => item.id === UNKNOWN_ACCOUNT_ID).currency = 'USD';
  const exact = createManualRepaymentDraft(state, claim.id, {amountCents:500, date:'2026-08-01', accountId:UNKNOWN_ACCOUNT_ID});
  const result = await recordManualRepayment(state, exact, async () => {}, options(later));
  assert.equal(result.transaction.currency, 'EUR');
  assert.equal(result.transaction.movementType, 'reimbursement');
  assert.notEqual(result.transaction.movementType, 'earned_income');
  assert.equal(result.claim.status, 'settled');
});

test('successful audit actions use approved names, groups, safe facts, and failed mutations append nothing', async () => {
  const state = stateFrom();
  const allocationId = addExpense(state, 'audit', 500);
  const claim = await makeClaim(state, [{allocationId, amountCents:500}]);
  const metadata = createClaimMetadataDraft(state, claim.id);
  metadata.note = 'secret payer note';
  await updateClaimMetadata(state, metadata, async () => {}, options(later));
  const amounts = createClaimAmountsDraft(state, claim.id);
  amounts.rows[0].amountCents = 450;
  await updateClaimAmounts(state, amounts, async () => {}, options(later));
  const inflow = addInflow(state, 'audit', 100);
  const payment = await applyPaymentDistribution(state, createPaymentDistributionDraft(state, inflow, {rows:[{claimId:claim.id, amountCents:100}]}), async () => {}, options(later));
  await voidPaymentLink(state, {paymentLinkId:payment.links[0].id, reason:'Wrong link', expectedRevision:state.stateRevision}, async () => {}, options(later));
  const writeOff = createWriteOffDraft(state, claim.id, {amountCents:50, reason:'Uncollectible', effectiveAt:later});
  await createWriteOff(state, writeOff, async () => {}, options(later));
  await reverseWriteOff(state, {adjustmentId:state.domain.reimbursementAdjustments.at(-1).id, reason:'Reopened', effectiveAt:later, expectedRevision:state.stateRevision}, async () => {}, options(later));
  const actions = new Set(state.domain.auditEvents.map(item => item.action));
  for (const action of ['claim_created', 'claim_metadata_updated', 'claim_amounts_updated', 'payment_linked', 'payment_link_voided', 'write_off_created', 'write_off_reversed']) {
    assert.equal(actions.has(action), true, action);
  }
  assert.equal(state.domain.auditEvents.every(item => typeof item.operationGroupId === 'string' && item.operationGroupId.length > 0), true);
  const serialized = JSON.stringify(state.domain.auditEvents);
  assert.equal(serialized.includes('secret payer note'), false);
  assert.equal(serialized.includes('Housemate'), false);
  assert.equal(state.domain.auditEvents.every(item => item.monetaryFacts === null || Object.keys(item.monetaryFacts).every(field => field.endsWith('Cents'))), true);
  const beforeFailureCount = state.domain.auditEvents.length;
  await rejectsCode(createWriteOff(state, {...createWriteOffDraft(state, claim.id, {reason:'Too much', effectiveAt:later}), amountCents:9999}, async () => {}, options()), REIMBURSEMENT_ERROR_CODES.WRITE_OFF_EXCEEDS_REMAINING);
  assert.equal(state.domain.auditEvents.length, beforeFailureCount);
});

test('payment drafts assign stable row IDs and reject missing or duplicate row IDs before claim-row validation', async () => {
  const state = stateFrom();
  const firstAllocation = addExpense(state, 'row-first', 500);
  const secondAllocation = addExpense(state, 'row-second', 500);
  const first = await makeClaim(state, [{allocationId:firstAllocation, amountCents:500}]);
  const second = await makeClaim(state, [{allocationId:secondAllocation, amountCents:500}]);
  const inflow = addInflow(state, 'row-identities', 500);
  const draft = createPaymentDistributionDraft(state, inflow, {rows:[
    {claimId:first.id, amountCents:200},
    {claimId:second.id, amountCents:200}
  ]});

  assert.equal(draft.rows.every(row => typeof row.id === 'string' && row.id.length > 0), true);
  assert.equal(new Set(draft.rows.map(row => row.id)).size, 2);
  assert.equal(validatePaymentDistribution(state, draft).ok, true);

  const missing = structuredClone(draft);
  missing.rows[0].id = ' ';
  assert.equal(validatePaymentDistribution(state, missing).errors[0].code, REIMBURSEMENT_ERROR_CODES.INVALID_PAYMENT_ROW);

  const duplicate = structuredClone(draft);
  duplicate.rows[1].id = duplicate.rows[0].id;
  duplicate.rows[1].claimId = duplicate.rows[0].claimId;
  assert.equal(validatePaymentDistribution(state, duplicate).errors[0].code, REIMBURSEMENT_ERROR_CODES.DUPLICATE_PAYMENT_ROW);
  const before = structuredClone(state);
  await rejectsCode(applyPaymentDistribution(state, duplicate, async () => assert.fail('must not persist'), options()), REIMBURSEMENT_ERROR_CODES.DUPLICATE_PAYMENT_ROW);
  assert.deepEqual(state, before);
});

test('same-revision drafts serialize, failed persistence hides raw errors, and revision overflow rolls back', async () => {
  const state = stateFrom();
  const firstAllocation = addExpense(state, 'revision-first', 500);
  const secondAllocation = addExpense(state, 'revision-second', 500);
  const firstDraft = createClaimDraft(state, {payerLabel:'First', allocationIds:[firstAllocation]});
  const secondDraft = createClaimDraft(state, {payerLabel:'Second', allocationIds:[secondAllocation]});
  await createClaim(state, firstDraft, async () => {}, options());
  const afterFirst = structuredClone(state);
  await rejectsCode(createClaim(state, secondDraft, async () => assert.fail('must not persist'), options()), REIMBURSEMENT_ERROR_CODES.STALE_STATE);
  assert.deepEqual(state, afterFirst);

  const current = createClaimDraft(state, {payerLabel:'Second', allocationIds:[secondAllocation]});
  const beforeFailure = structuredClone(state);
  let mapped;
  try {
    await createClaim(state, current, async () => { throw new Error('raw encrypted storage secret'); }, options());
  } catch (error) {
    mapped = error;
  }
  assert.equal(mapped?.code, REIMBURSEMENT_ERROR_CODES.PERSISTENCE_FAILED);
  assert.equal(mapped?.message, 'The reimbursement change could not be saved.');
  assert.equal(Object.hasOwn(mapped, 'cause'), false);
  assert.equal(JSON.stringify(mapped).includes('raw encrypted storage secret'), false);
  assert.deepEqual(state, beforeFailure);

  const overflow = structuredClone(state);
  overflow.stateRevision = Number.MAX_SAFE_INTEGER;
  const overflowDraft = createClaimDraft(overflow, {payerLabel:'Second', allocationIds:[secondAllocation]});
  const beforeOverflow = structuredClone(overflow);
  await rejectsCode(createClaim(overflow, overflowDraft, async () => assert.fail('must not persist'), options()), REIMBURSEMENT_ERROR_CODES.DOMAIN_INVALID);
  assert.deepEqual(overflow, beforeOverflow);
});

test('ID collisions during claim, distribution, and manual-repayment construction restore every collection and revision', async () => {
  const claimState = stateFrom();
  const allocationId = addExpense(claimState, 'claim-id-collision', 500);
  const claimDraft = createClaimDraft(claimState, {payerLabel:'Payer', allocationIds:[allocationId]});
  const beforeClaim = structuredClone(claimState);
  const claimIds = ['claim-new', 'group-new', 'claim-link-new', 'claim-new'];
  await rejectsCode(createClaim(claimState, claimDraft, async () => assert.fail('must not persist'), {now, idFactory:() => claimIds.shift()}), REIMBURSEMENT_ERROR_CODES.INVALID_OPERATION);
  assert.deepEqual(claimState, beforeClaim);

  const distributionState = stateFrom();
  const firstAllocation = addExpense(distributionState, 'distribution-id-first', 500);
  const secondAllocation = addExpense(distributionState, 'distribution-id-second', 500);
  const firstClaim = await makeClaim(distributionState, [{allocationId:firstAllocation, amountCents:500}]);
  const secondClaim = await makeClaim(distributionState, [{allocationId:secondAllocation, amountCents:500}]);
  const inflow = addInflow(distributionState, 'distribution-id-collision', 500);
  const distribution = createPaymentDistributionDraft(distributionState, inflow, {rows:[
    {claimId:firstClaim.id, amountCents:200},
    {claimId:secondClaim.id, amountCents:200}
  ]});
  const beforeDistribution = structuredClone(distributionState);
  const distributionIds = ['group-distribution', 'link-distribution', 'audit-distribution', 'link-distribution'];
  await rejectsCode(applyPaymentDistribution(distributionState, distribution, async () => assert.fail('must not persist'), {now, idFactory:() => distributionIds.shift()}), REIMBURSEMENT_ERROR_CODES.INVALID_OPERATION);
  assert.deepEqual(distributionState, beforeDistribution);

  for (const collision of ['transaction', 'link', 'audit']) {
    const state = stateFrom();
    const sourceAllocation = addExpense(state, `manual-${collision}`, 500);
    const claim = await makeClaim(state, [{allocationId:sourceAllocation, amountCents:500}]);
    const draft = createManualRepaymentDraft(state, claim.id, {amountCents:100, date:'2026-08-03'});
    const before = structuredClone(state);
    const existingTransactionId = state.domain.transactions[0].id;
    const existingRelationshipId = state.domain.auditEvents[0].id;
    const generated = collision === 'transaction'
      ? ['group-manual', existingTransactionId, 'link-manual', 'audit-manual-a', 'audit-manual-b']
      : collision === 'link'
        ? ['group-manual', 'transaction-manual', existingRelationshipId]
        : ['group-manual', 'transaction-manual', 'link-manual', existingRelationshipId];
    const expectedCode = collision === 'transaction' ? REIMBURSEMENT_ERROR_CODES.DOMAIN_INVALID : REIMBURSEMENT_ERROR_CODES.INVALID_OPERATION;
    await rejectsCode(recordManualRepayment(state, draft, async () => assert.fail('must not persist'), {now, idFactory:() => generated.shift()}), expectedCode);
    assert.deepEqual(state, before, collision);
  }
});

test('stable service errors cover missing, cancelled, malformed, chronology, and persistence boundaries', async () => {
  const state = stateFrom();
  const allocationId = addExpense(state, 'error-contract', 500);
  const claim = await makeClaim(state, [{allocationId, amountCents:500}]);

  await rejectsCode(cancelClaim(state, {claimId:'missing-claim', reason:'x', expectedRevision:state.stateRevision}, async () => {}, options()), REIMBURSEMENT_ERROR_CODES.CLAIM_NOT_FOUND);
  await rejectsCode(cancelClaim(state, {claimId:claim.id, reason:' ', expectedRevision:state.stateRevision}, async () => {}, options()), REIMBURSEMENT_ERROR_CODES.INVALID_REASON);
  await rejectsCode(createWriteOff(state, {...createWriteOffDraft(state, claim.id), reason:'x'}, async () => {}, options()), REIMBURSEMENT_ERROR_CODES.INVALID_DATE);
  await rejectsCode(reverseWriteOff(state, {adjustmentId:'missing-write-off', reason:'x', effectiveAt:later, expectedRevision:state.stateRevision}, async () => {}, options()), REIMBURSEMENT_ERROR_CODES.WRITE_OFF_NOT_FOUND);
  await rejectsCode(voidPaymentLink(state, {paymentLinkId:'missing-payment', reason:'x', expectedRevision:state.stateRevision}, async () => {}, options()), REIMBURSEMENT_ERROR_CODES.PAYMENT_NOT_FOUND);

  const inflow = addInflow(state, 'error-contract', 500);
  const invalidAmount = createPaymentDistributionDraft(state, inflow, {rows:[{claimId:claim.id, amountCents:0}]});
  assert.equal(validatePaymentDistribution(state, invalidAmount).errors[0].code, REIMBURSEMENT_ERROR_CODES.INVALID_CLAIM_AMOUNT);
  const invalidSource = createPaymentDistributionDraft(state, inflow, {source:'automatic', rows:[{claimId:claim.id, amountCents:1}]});
  assert.equal(validatePaymentDistribution(state, invalidSource).errors[0].code, REIMBURSEMENT_ERROR_CODES.INVALID_OPERATION);

  const adjustment = await createWriteOff(state, createWriteOffDraft(state, claim.id, {amountCents:100, reason:'Uncollectible', effectiveAt:later}), async () => {}, options(later));
  assert.equal(adjustment.writtenOffAmountCents, 100);
  await rejectsCode(reverseWriteOff(state, {
    adjustmentId:state.domain.reimbursementAdjustments.at(-1).id,
    reason:'Too early', effectiveAt:now, expectedRevision:state.stateRevision
  }, async () => {}, options(later)), REIMBURSEMENT_ERROR_CODES.INVALID_ADJUSTMENT_CHRONOLOGY);

  const cancellableState = stateFrom();
  const cancellableAllocation = addExpense(cancellableState, 'cancelled-error', 500);
  const cancellable = await makeClaim(cancellableState, [{allocationId:cancellableAllocation, amountCents:500}]);
  await cancelClaim(cancellableState, {claimId:cancellable.id, reason:'Created in error', expectedRevision:cancellableState.stateRevision}, async () => {}, options(later));
  const cancelledDraft = {expectedRevision:cancellableState.stateRevision, claimId:cancellable.id, payerLabel:'No', dueDate:null, note:null};
  await rejectsCode(updateClaimMetadata(cancellableState, cancelledDraft, async () => {}, options(later)), REIMBURSEMENT_ERROR_CODES.CLAIM_CANCELLED);
});

test('encrypted persistence failure rolls back service state and leaves the prior active vault unlockable', async () => {
  installBrowserGlobals();
  const seed = stateFrom();
  const allocationId = addExpense(seed, 'encrypted-rollback', 500);
  const stateService = createStateService({repository:createVaultRepository(), seed});
  const passphrase = 'encrypted reimbursement rollback acceptance';
  const created = await stateService.create(passphrase, seed);
  const state = created.state;
  const beforeState = structuredClone(state);
  const table = currentFakeVaultsTable();
  const beforeRow = structuredClone(table.rows.get(TEST_USER_ID));

  // 'before-apply' simulates a write that never reached the server: the table stays
  // untouched, so this is a genuine persistence failure, not the ambiguous-but-
  // actually-committed case (that path is covered separately and resolves to
  // success, by design -- see test/hosted-vault-storage.test.js).
  setSupabaseClientForTests(table.client(TEST_USER_ID, {failMode:'before-apply'}));

  const draft = createClaimDraft(state, {payerLabel:'Payer', allocationIds:[allocationId]});
  const persist = async () => stateService.save(state, created.key, created.meta);

  let mapped;
  try {
    await createClaim(state, draft, persist, options());
  } catch (error) {
    mapped = error;
  }
  assert.equal(mapped?.code, REIMBURSEMENT_ERROR_CODES.PERSISTENCE_FAILED);
  assert.equal(Object.hasOwn(mapped, 'cause'), false);
  assert.deepEqual(state, beforeState);
  assert.deepEqual(table.rows.get(TEST_USER_ID), beforeRow);

  setSupabaseClientForTests(table.client(TEST_USER_ID));
  const recovered = await stateService.unlock(passphrase);
  assert.deepEqual(recovered.state, beforeState);
});

test('every acceptance-matrix mutation survives an immediate encrypted reload with exact canonical and compatibility state', async () => {
  installBrowserGlobals();
  const seed = stateFrom('ambiguousMulti');
  const allocationA = addExpense(seed, 'matrix-a', 1000);
  const allocationB = addExpense(seed, 'matrix-b', 400);
  const allocationC = addExpense(seed, 'matrix-c', 300);
  const allocationD = addExpense(seed, 'matrix-d', 200);
  const inflowPartial = addInflow(seed, 'matrix-partial', 100);
  const inflowSplit = addInflow(seed, 'matrix-split', 600);
  const stateService = createStateService({repository:createVaultRepository(), seed});
  const passphrase = 'phase 3b immediate encrypted reload matrix';
  const created = await stateService.create(passphrase, seed);
  let state = created.state;
  let key = created.key;
  let meta = created.meta;

  async function mutateAndReload(label, mutation) {
    const priorRevision = state.stateRevision;
    let saves = 0;
    const persist = async () => {
      saves += 1;
      meta = (await stateService.save(state, key, meta)).meta;
    };
    await mutation(persist);
    assert.equal(saves, 1, `${label}: persistence count`);
    assert.equal(state.stateRevision, priorRevision + 1, `${label}: revision increment`);
    const expected = structuredClone(state);
    const unlocked = await stateService.unlock(passphrase);
    assert.deepEqual(unlocked.state, expected, `${label}: complete state`);
    assert.equal(unlocked.state.legacyFoundation.unresolvedReimbursementClaims.length, 1, `${label}: compatibility evidence`);
    assert.equal(validateDomainStore(unlocked.state.domain).ok, true, `${label}: domain validity`);
    state = unlocked.state;
    key = unlocked.key;
    meta = unlocked.meta;
  }

  let claimAId;
  let claimBId;
  let claimCId;
  let claimDId;
  let splitLinkForA;
  let reversibleWriteOffId;

  await mutateAndReload('claim creation', async persist => {
    const claim = await createClaim(state, createClaimDraft(state, {payerLabel:'Payer A', rows:[{allocationId:allocationA, amountCents:500}]}), persist, options());
    claimAId = claim.id;
  });
  await mutateAndReload('metadata edit', async persist => {
    const draft = createClaimMetadataDraft(state, claimAId);
    draft.dueDate = '2026-08-31';
    draft.note = 'Synthetic matrix note';
    await updateClaimMetadata(state, draft, persist, options(later));
  });
  await mutateAndReload('amount increase', async persist => {
    const draft = createClaimAmountsDraft(state, claimAId);
    draft.rows[0].amountCents = 700;
    await updateClaimAmounts(state, draft, persist, options(later));
  });
  await mutateAndReload('amount decrease', async persist => {
    const draft = createClaimAmountsDraft(state, claimAId);
    draft.rows[0].amountCents = 550;
    await updateClaimAmounts(state, draft, persist, options(later));
  });
  await mutateAndReload('second claim creation', async persist => {
    const claim = await createClaim(state, createClaimDraft(state, {payerLabel:'Payer B', allocationIds:[allocationB]}), persist, options(later));
    claimBId = claim.id;
  });
  await mutateAndReload('partial payment', async persist => {
    await applyPaymentDistribution(state, createPaymentDistributionDraft(state, inflowPartial, {rows:[{claimId:claimAId, amountCents:100}]}), persist, options(later));
    assert.equal(projectClaim(state, claimAId).status, 'partially_paid');
  });
  await mutateAndReload('one inflow split and full settlement', async persist => {
    const result = await applyPaymentDistribution(state, createPaymentDistributionDraft(state, inflowSplit, {rows:[
      {claimId:claimAId, amountCents:200},
      {claimId:claimBId, amountCents:400}
    ]}), persist, options(later));
    splitLinkForA = result.links.find(link => link.claimId === claimAId).id;
    assert.equal(projectClaim(state, claimBId).status, 'settled');
  });
  await mutateAndReload('payment void', async persist => {
    await voidPaymentLink(state, {paymentLinkId:splitLinkForA, reason:'Synthetic correction', expectedRevision:state.stateRevision}, persist, options('2026-08-02T12:00:00.000Z'));
    assert.equal(projectInflowAvailability(state, inflowSplit).availableAmountCents, 200);
  });
  await mutateAndReload('partial write-off', async persist => {
    await createWriteOff(state, createWriteOffDraft(state, claimAId, {amountCents:50, reason:'Synthetic partial write-off', effectiveAt:'2026-08-03T12:00:00.000Z'}), persist, options('2026-08-03T12:00:00.000Z'));
    reversibleWriteOffId = state.domain.reimbursementAdjustments.at(-1).id;
  });
  await mutateAndReload('write-off reversal', async persist => {
    await reverseWriteOff(state, {adjustmentId:reversibleWriteOffId, reason:'Synthetic reversal', effectiveAt:'2026-08-04T12:00:00.000Z', expectedRevision:state.stateRevision}, persist, options('2026-08-04T12:00:00.000Z'));
    assert.equal(projectClaim(state, claimAId).writtenOffAmountCents, 0);
  });
  await mutateAndReload('third claim creation', async persist => {
    const claim = await createClaim(state, createClaimDraft(state, {payerLabel:'Payer C', allocationIds:[allocationC]}), persist, options('2026-08-05T12:00:00.000Z'));
    claimCId = claim.id;
  });
  await mutateAndReload('full write-off', async persist => {
    await createWriteOff(state, createWriteOffDraft(state, claimCId, {reason:'Synthetic full write-off', effectiveAt:'2026-08-06T12:00:00.000Z'}), persist, options('2026-08-06T12:00:00.000Z'));
    assert.equal(projectClaim(state, claimCId).status, 'written_off');
  });
  await mutateAndReload('fourth claim creation', async persist => {
    const claim = await createClaim(state, createClaimDraft(state, {payerLabel:'Payer D', allocationIds:[allocationD]}), persist, options('2026-08-07T12:00:00.000Z'));
    claimDId = claim.id;
  });
  await mutateAndReload('cancellation', async persist => {
    await cancelClaim(state, {claimId:claimDId, reason:'Synthetic cancellation', expectedRevision:state.stateRevision}, persist, options('2026-08-08T12:00:00.000Z'));
    assert.equal(projectClaim(state, claimDId).status, 'cancelled');
  });
  await mutateAndReload('manual repayment', async persist => {
    await recordManualRepayment(state, createManualRepaymentDraft(state, claimAId, {amountCents:100, date:'2026-08-09', accountId:UNKNOWN_ACCOUNT_ID}), persist, options('2026-08-09T12:00:00.000Z'));
    const manual = state.domain.transactions.at(-1);
    assert.equal(manual.movementType, 'reimbursement');
    assert.equal(manual.locationRegion, null);
    assert.equal(manual.locationCountry, null);
  });
});

test('state revision and reimbursement facts survive encrypted backup and restore without an extra increment', async () => {
  installBrowserGlobals();
  const seed = stateFrom();
  const firstAllocation = addExpense(seed, 'backup-first', 500);
  const secondAllocation = addExpense(seed, 'backup-second', 500);
  const stateService = createStateService({repository:createVaultRepository(), seed});
  const passphrase = 'phase 3b revision backup restore';
  const created = await stateService.create(passphrase, seed);
  const state = created.state;
  let meta = created.meta;
  const persist = async () => { meta = (await stateService.save(state, created.key, meta)).meta; };

  const first = await createClaim(state, createClaimDraft(state, {payerLabel:'Backup payer', allocationIds:[firstAllocation]}), persist, options());
  const backupState = structuredClone(state);
  const encryptedBackup = await stateService.exportEncryptedBackup();
  await createClaim(state, createClaimDraft(state, {payerLabel:'Later payer', allocationIds:[secondAllocation]}), persist, options(later));
  assert.equal(state.stateRevision, backupState.stateRevision + 1);

  const restored = await stateService.restore(encryptedBackup, passphrase);
  assert.equal(restored.state.stateRevision, backupState.stateRevision);
  assert.deepEqual(restored.state, backupState);
  assert.equal(projectClaim(restored.state, first.id).status, 'open');
  const unlocked = await stateService.unlock(passphrase);
  assert.deepEqual(unlocked.state, backupState);
});
