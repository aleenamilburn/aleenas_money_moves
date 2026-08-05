import assert from 'node:assert/strict';
import test from 'node:test';
import {upgradeStateWithMigration} from '../js/state.js';
import {validateFoundationDomain} from '../js/domain/migrations.js';

test('the public bootstrap seed is an empty, migration-valid baseline rather than embedded financial data', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};
  try {
    await import(`../data.js?public-bootstrap-seed=${Date.now()}`);
    const seed = globalThis.window.MONEY_MOVES_SEED;
    assert.equal(seed.review.transactions.length, 0);
    assert.equal(seed.providerSnapshot.accounts.length, 0);
    assert.equal(seed.providerSnapshot.recurring.length, 0);
    const migrated = upgradeStateWithMigration(seed, seed, {now:'2026-08-04T12:00:00.000Z'}).state;
    assert.equal(validateFoundationDomain(migrated.domain).ok, true);
  } finally {
    globalThis.window = previousWindow;
  }
});
