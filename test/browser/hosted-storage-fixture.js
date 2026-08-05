// Hosted-storage browser harness. It uses only a synthetic in-memory Supabase
// client and is intentionally unreachable from product navigation.
import {createStateService} from '../../js/services/stateService.js';
import {advanceStateRevision} from '../../js/services/stateRevision.js';
import {createVaultRepository} from '../../js/services/vaultRepository.js';
import {setSupabaseClientForTests} from '../../js/services/supabaseClient.js';
import {createFakeVaultsTable} from '../hostedVaultFake.js';

const TEST_USER_ID = 'browser-fixture-user';
let table = null;
let primary = null;
let stale = null;

function fixtureState() {
  return {
    schemaVersion:7,
    stateRevision:0,
    preferences:{lockMinutes:60},
    domain:{
      transactions:[], accounts:[], buckets:[], allocations:[], merchantRules:[],
      reimbursementClaims:[], reimbursementClaimAllocations:[], reimbursementPaymentLinks:[],
      reimbursementAdjustments:[], auditEvents:[], legacyMonthlySnapshots:[], legacyBalanceSnapshots:[]
    }
  };
}

function service() {
  return createStateService({repository:createVaultRepository(), seed:fixtureState()});
}

function summary(session) {
  if (!session) return null;
  return {
    stateRevision:session.state.stateRevision,
    vaultGeneration:session.vaultGeneration,
    vaultSequence:session.meta.vaultSequence,
    preferences:Object.keys(session.state.preferences).sort()
  };
}

export async function installHostedFixture(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 12) throw new Error('A test-supplied passphrase is required.');
  table = createFakeVaultsTable();
  setSupabaseClientForTests(table.client(TEST_USER_ID));
  const stateService = service();
  const created = await stateService.create(passphrase, fixtureState());
  primary = {stateService, ...created};
  stale = await stateService.unlock(passphrase);
  stale.stateService = stateService;
  return {primary:summary(primary), stale:summary(stale)};
}

export async function saveFromPrimary() {
  if (!primary) throw new Error('Install the hosted fixture first.');
  primary.state.preferences.primaryWrite = true;
  advanceStateRevision(primary.state);
  const saved = await primary.stateService.save(primary.state, primary.key, primary.meta, {
    expectedVaultGeneration:primary.vaultGeneration
  });
  Object.assign(primary, saved);
  return summary(primary);
}

export async function attemptStaleSave() {
  if (!stale) throw new Error('Install the hosted fixture first.');
  stale.state.preferences.staleWrite = true;
  advanceStateRevision(stale.state);
  const before = structuredClone(stale.state);
  try {
    await stale.stateService.save(stale.state, stale.key, stale.meta, {
      expectedVaultGeneration:stale.vaultGeneration
    });
    return {code:null, rolledBack:false};
  } catch (error) {
    // The browser harness does not mutate product state. Its caller can assert the
    // service-level failure and confirm that the stale draft remains local only.
    return {code:error.code || null, draftStateRevision:before.stateRevision, rolledBackByUi:false};
  }
}

export async function reloadPrimary(passphrase) {
  if (!primary) throw new Error('Install the hosted fixture first.');
  const reloaded = await primary.stateService.unlock(passphrase);
  primary = {stateService:primary.stateService, ...reloaded};
  return summary(primary);
}

export function inspectHostedRow() {
  if (!table) return null;
  const row = table.rows.get(TEST_USER_ID);
  if (!row) return null;
  return {
    generation:row.generation,
    vaultSequence:row.blob.vaultSequence,
    cipherName:row.blob.cipher.name,
    ciphertextPresent:typeof row.blob.cipher.ciphertext === 'string' && row.blob.cipher.ciphertext.length > 0,
    plaintextKeys:Object.keys(row.blob).filter(key => ['transactions', 'accounts', 'allocations', 'reimbursements'].includes(key))
  };
}
