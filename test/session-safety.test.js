import assert from 'node:assert/strict';
import test from 'node:test';
import {mustClearUnlockedVault, sessionUserId} from '../js/services/sessionSafety.js';

test('same-user token refresh preserves the locked/unlocked decision while an identity change clears it', () => {
  const first = {user:{id:'user-a'}};
  assert.equal(sessionUserId(first), 'user-a');
  assert.equal(mustClearUnlockedVault(first, {user:{id:'user-a'}}), false);
  assert.equal(mustClearUnlockedVault(first, {user:{id:'user-b'}}), true);
  assert.equal(mustClearUnlockedVault(first, null), false);
  assert.equal(sessionUserId({user:{id:''}}), null);
});
