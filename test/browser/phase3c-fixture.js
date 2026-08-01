import {upgradeStateWithMigration} from '../../js/state.js';
import {createStateService} from '../../js/services/stateService.js';
import {advanceStateRevision} from '../../js/services/stateRevision.js';
import {createVaultRepository} from '../../js/services/vaultRepository.js';
import {createClaimMetadataDraft, updateClaimMetadata} from '../../js/services/reimbursementService.js';
import {clearVault, readVaultGeneration, vaultConstants} from '../../js/vault.js';
import {schema6ReimbursementFixtures} from '../fixtures/schema6-reimbursements.js';

let session = null;

function syntheticClaimedState() {
  const input = schema6ReimbursementFixtures.safeSingle();
  input.preferences = {...syntheticSeed().preferences, lockMinutes:60, showScripture:false, monthlyIncome:1000};
  input.monthly = {...syntheticSeed().monthly, activeMonth:'2026-07', selectedMonth:'2026-07', lastOpenedMonth:'2026-07'};
  input.providerSnapshot = {
    asOf:'2026-07-30', averageMonthlyIncome:1000, cashTotal:0,
    creditDebtTotal:0, netWorth:0, coverage:'Synthetic fixture', accounts:[], recurring:[]
  };
  input.review = {
    ...input.review,
    selectedWeek:'2026-07-27',
    buckets:[...syntheticSeed().review.buckets, {
      id:'synthetic-bucket', name:'Synthetic bucket', group:'Needs', target:10, system:false,
      order:1, protected:false, active:true
    }],
    transactions:[{
      id:'expense-single', date:'2026-07-30', weekStart:'2026-07-27', merchant:'Synthetic expense',
      merchantKey:'synthetic expense', name:'Synthetic expense', amount:10, account:'Synthetic account',
      providerCategory:'synthetic', providerDetail:'', providerConfidence:'', flow:'outflow',
      bucketId:'synthetic-bucket', reviewStatus:'pending', reviewedAt:null, source:'test-fixture',
      importedAt:'2026-07-30T12:00:00.000Z'
    }],
    merchantRules:[], importSettings:{positiveMeansSpend:true, includeMoneyMovement:true}
  };
  input.travel = {visited:[], destinations:[]};
  input.debts = [];
  input.goals = [];
  input.scriptures = [];
  return upgradeStateWithMigration(input, syntheticSeed(), {now:'2026-07-31T00:00:00.000Z'}).state;
}

function syntheticSeed() {
  const seed = structuredClone(window.MONEY_MOVES_SEED);
  seed.providerSnapshot = {
    ...seed.providerSnapshot, asOf:'2026-07-30', averageMonthlyIncome:1000, cashTotal:0,
    creditDebtTotal:0, netWorth:0, coverage:'Synthetic fixture', accounts:[], recurring:[]
  };
  seed.review = {...seed.review, transactions:[], merchantRules:[]};
  seed.travel = {visited:[], destinations:[]};
  seed.debts = [];
  seed.goals = [];
  seed.scriptures = [];
  return seed;
}

function service() {
  const seed = syntheticSeed();
  return createStateService({
    repository:createVaultRepository(), seed,
    migrate:input => upgradeStateWithMigration(input, seed, {now:'2026-07-31T00:00:00.000Z'})
  });
}

export async function installClaimedAllocationFixture(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 12) throw new Error('A test-supplied passphrase is required.');
  clearVault();
  const created = await service().create(passphrase, syntheticClaimedState());
  session = null;
  return {
    stateRevision:created.state.stateRevision,
    vaultGeneration:created.vaultGeneration,
    transactionId:'expense-single',
    allocationId:'allocation-single',
    claimId:created.state.domain.reimbursementClaims[0].id
  };
}

export async function installUnclaimedAllocationFixture(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 12) throw new Error('A test-supplied passphrase is required.');
  clearVault();
  const state = syntheticClaimedState();
  state.domain.reimbursementClaims = [];
  state.domain.reimbursementClaimAllocations = [];
  state.domain.allocations[0].ownershipType = 'mine';
  const created = await service().create(passphrase, state);
  session = null;
  return {
    stateRevision:created.state.stateRevision,
    vaultGeneration:created.vaultGeneration,
    transactionId:'expense-single',
    allocationId:'allocation-single'
  };
}

export async function openTestSession(passphrase) {
  const stateService = service();
  const unlocked = await stateService.unlock(passphrase);
  session = {stateService, ...unlocked};
  return inspectTestSession();
}

export function inspectTestSession() {
  if (!session) return null;
  return {
    stateRevision:session.state.stateRevision,
    vaultGeneration:session.vaultGeneration,
    claimCount:session.state.domain.reimbursementClaims.length,
    claimAllocationCount:session.state.domain.reimbursementClaimAllocations.length,
    payerLabel:session.state.domain.reimbursementClaims[0]?.payerLabel || null
  };
}

export async function commitSyntheticClaimLabel(payerLabel) {
  if (!session) throw new Error('Open a test session first.');
  const claim = session.state.domain.reimbursementClaims[0];
  const draft = createClaimMetadataDraft(session.state, claim.id);
  draft.payerLabel = payerLabel;
  const persist = async () => {
    const saved = await session.stateService.save(session.state, session.key, session.meta, {
      expectedVaultGeneration:session.vaultGeneration
    });
    session.meta = saved.meta;
    session.vaultGeneration = saved.vaultGeneration;
  };
  await updateClaimMetadata(session.state, draft, persist, {now:'2026-07-31T12:00:00.000Z'});
  return inspectTestSession();
}

export async function inspectEncryptedFixture(passphrase) {
  const unlocked = await service().unlock(passphrase);
  return {
    stateRevision:unlocked.state.stateRevision,
    vaultGeneration:unlocked.vaultGeneration,
    allocationOwnership:unlocked.state.domain.allocations[0]?.ownershipType || null,
    allocationNote:unlocked.state.domain.allocations[0]?.note || null,
    bucketName:unlocked.state.review.buckets.find(bucket => bucket.id === 'synthetic-bucket')?.name || null,
    allocationClaimId:unlocked.state.domain.reimbursementClaimAllocations[0]?.claimId || null,
    claimId:unlocked.state.domain.reimbursementClaims[0]?.id || null,
    payerLabel:unlocked.state.domain.reimbursementClaims[0]?.payerLabel || null
  };
}

export function installSyntheticLease({ownerToken = 'synthetic-abandoned-writer', expiresAt}) {
  localStorage.setItem(vaultConstants.WRITE_LEASE_KEY, JSON.stringify({version:1, ownerToken, expiresAt}));
}

export function installExpiredSyntheticLease() {
  installSyntheticLease({expiresAt:Date.now()-1});
  return {expired:true};
}

export async function runTemporaryWriteConflict(passphrase) {
  const stateService = service();
  const unlocked = await stateService.unlock(passphrase);
  unlocked.state.preferences.syntheticTemporaryConflict = true;
  advanceStateRevision(unlocked.state);
  try {
    await stateService.save(unlocked.state, unlocked.key, unlocked.meta, {
      expectedVaultGeneration:unlocked.vaultGeneration,
      coordination:{beforePromotion:async () => {
        const envelope = JSON.parse(localStorage.getItem(vaultConstants.VAULT_KEY));
        envelope.vaultGeneration = `mmvg:${crypto.randomUUID()}`;
        localStorage.setItem(vaultConstants.VAULT_KEY, JSON.stringify(envelope));
      }}
    });
    return {error:null};
  } catch (error) {
    return {
      error:error.message,
      code:error.code || null,
      vaultGeneration:await readVaultGeneration(),
      temporaryPresent:localStorage.getItem(vaultConstants.TEMP_KEY) !== null
    };
  }
}

export function removeFixture() {
  clearVault();
  session = null;
}

export {readVaultGeneration};
