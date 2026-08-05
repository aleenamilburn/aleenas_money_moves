import assert from 'node:assert/strict';
import test from 'node:test';
import {STATE_SCHEMA_VERSION} from '../js/domain/constants.js';
import {validateDomainStore} from '../js/domain/models.js';
import {migrateState} from '../js/domain/migrations.js';
import {
  DEVOTIONAL_ERROR_CODES,
  DevotionalServiceError,
  advanceToNextDevotional,
  completeDevotional,
  createDevotionalDraft,
  getActiveDevotional,
  getDevotionalHistory,
  reopenDevotional,
  saveDevotionalResponses,
  toggleSavedDevotional,
  validateDevotionalDraft
} from '../js/services/devotionalService.js';
import {legacyV1State} from './helpers.js';

const NOW = '2026-08-05T12:00:00.000Z';
const NEXT = '2026-08-05T12:01:00.000Z';

function state() {
  return migrateState(legacyV1State(), {now:NOW}).state;
}

function persistCounter() {
  let calls = 0;
  return {persist:async () => { calls += 1; }, calls:() => calls};
}

test('schema 8 migrates financial state non-destructively into schema 9 devotional state', () => {
  const current = state();
  const schema8 = structuredClone(current);
  schema8.schemaVersion = 8;
  delete schema8.domain.devotionalState;
  const financialBefore = structuredClone({
    accounts:schema8.domain.accounts,
    transactions:schema8.domain.transactions,
    buckets:schema8.domain.buckets,
    allocations:schema8.domain.allocations,
    reimbursementClaims:schema8.domain.reimbursementClaims
  });

  const migrated = migrateState(schema8, {now:NEXT});
  assert.equal(migrated.fromVersion, 8);
  assert.equal(migrated.toVersion, STATE_SCHEMA_VERSION);
  assert.deepEqual(migrated.applied, ['v2c-faith-money-devotional-state']);
  assert.equal(migrated.state.domain.devotionalState.activeDevotionalId, 'faith-money-mammon');
  assert.deepEqual(migrated.state.domain.devotionalState.entries, []);
  assert.deepEqual({
    accounts:migrated.state.domain.accounts,
    transactions:migrated.state.domain.transactions,
    buckets:migrated.state.domain.buckets,
    allocations:migrated.state.domain.allocations,
    reimbursementClaims:migrated.state.domain.reimbursementClaims
  }, financialBefore);
  assert.equal(validateDomainStore(migrated.state.domain, {legacyDevotionalState:false}).ok, true);
});

test('a malformed pre-existing devotional state fails safely before a schema 8 migration', () => {
  const schema8 = state();
  schema8.schemaVersion = 8;
  schema8.domain.devotionalState = {activeDevotionalId:'not-a-library-id'};
  assert.throws(
    () => migrateState(schema8, {now:NEXT}),
    /Pre-migration state failed foundation validation/
  );
});

test('responses and private notes save atomically, retain a content version, and support edits', async () => {
  const vault = state();
  const initialRevision = vault.stateRevision;
  const saved = persistCounter();
  const draft = createDevotionalDraft(vault);
  draft.promptResponses[0].response = 'A private response that belongs only in my encrypted vault.';
  draft.privateNotes = 'A private note for later reflection.';

  const entry = await saveDevotionalResponses(vault, draft, saved.persist, {now:NOW, idFactory:() => 'entry-1'});
  assert.equal(saved.calls(), 1);
  assert.equal(vault.stateRevision, initialRevision + 1);
  assert.equal(entry.contentVersion, 1);
  assert.equal(entry.promptResponses.length, 1);
  assert.equal(entry.privateNotes, 'A private note for later reflection.');

  const edit = createDevotionalDraft(vault);
  edit.promptResponses[0].response = 'An edited private response.';
  edit.privateNotes = 'An edited private note.';
  await saveDevotionalResponses(vault, edit, saved.persist, {now:NEXT});
  assert.equal(vault.stateRevision, initialRevision + 2);
  assert.equal(vault.domain.devotionalState.entries.length, 1);
  assert.equal(vault.domain.devotionalState.entries[0].promptResponses[0].response, 'An edited private response.');
  assert.equal(vault.domain.devotionalState.entries[0].privateNotes, 'An edited private note.');
  assert.equal(validateDomainStore(vault.domain, {legacyDevotionalState:false}).ok, true);
});

test('completion works without answers, saved history is explicit, and progression is deterministic', async () => {
  const vault = state();
  const saved = persistCounter();
  const first = getActiveDevotional(vault);
  await toggleSavedDevotional(vault, {expectedRevision:vault.stateRevision, devotionalId:first.id, saved:true}, saved.persist, {now:NOW});
  await completeDevotional(vault, {expectedRevision:vault.stateRevision, devotionalId:first.id}, saved.persist, {now:NEXT, idFactory:() => 'entry-complete'});
  assert.equal(vault.domain.devotionalState.entries[0].promptResponses.length, 0);
  assert.ok(vault.domain.devotionalState.entries[0].completedAt);
  const next = await advanceToNextDevotional(vault, {expectedRevision:vault.stateRevision, devotionalId:first.id}, saved.persist, {now:'2026-08-05T12:02:00.000Z'});
  assert.deepEqual(next, {devotionalId:first.id, nextDevotionalId:'faith-money-stewardship', hasNext:true});
  assert.equal(getActiveDevotional(vault).id, 'faith-money-stewardship');
  const history = getDevotionalHistory(vault);
  assert.equal(history[0].isSaved, true);
  assert.equal(history[0].isCompleted, true);
  assert.equal(history[1].isActive, true);
  assert.equal(reopenDevotional(vault, first.id).entry.id, 'entry-complete');
  assert.equal(saved.calls(), 3);
});

test('stale, invalid, oversized, and failed devotional saves never leak journal text or mutate the vault', async () => {
  const vault = state();
  const before = structuredClone(vault);
  const secret = 'private-journal-text-must-never-appear-in-errors';
  const invalid = createDevotionalDraft(vault);
  invalid.privateNotes = secret.repeat(1000);
  const validation = validateDevotionalDraft(vault, invalid);
  assert.equal(validation.ok, false);
  assert.equal(validation.errors[0].message.includes(secret), false);
  await assert.rejects(
    () => saveDevotionalResponses(vault, invalid, async () => {}, {now:NOW}),
    error => error instanceof DevotionalServiceError
      && error.code === DEVOTIONAL_ERROR_CODES.INVALID_PRIVATE_NOTES
      && !error.message.includes(secret)
  );
  assert.deepEqual(vault, before);

  const failed = createDevotionalDraft(vault);
  failed.privateNotes = secret;
  await assert.rejects(
    () => saveDevotionalResponses(vault, failed, async () => { throw new Error(secret); }, {now:NOW, idFactory:() => 'entry-failed'}),
    error => error instanceof DevotionalServiceError
      && error.code === DEVOTIONAL_ERROR_CODES.PERSISTENCE_FAILED
      && !error.message.includes(secret)
  );
  assert.deepEqual(vault, before);

  const stale = createDevotionalDraft(vault);
  await toggleSavedDevotional(vault, {expectedRevision:vault.stateRevision, devotionalId:stale.devotionalId, saved:true}, async () => {}, {now:NOW});
  await assert.rejects(
    () => saveDevotionalResponses(vault, stale, async () => {}, {now:NEXT}),
    error => error instanceof DevotionalServiceError && error.code === DEVOTIONAL_ERROR_CODES.STALE_STATE
  );
});
