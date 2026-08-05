import assert from 'node:assert/strict';
import test from 'node:test';
import {getCurrentSession, signInWithProvider, signOut} from '../js/services/authService.js';
import {setSupabaseClientForTests} from '../js/services/supabaseClient.js';

function failingClient() {
  return {
    auth: {
      async signInWithOAuth() { return {error:{message:'raw provider URL token=do-not-expose'}}; },
      async getSession() { return {data:{session:null}, error:{message:'raw session diagnostic'}}; },
      async signOut() { return {error:{message:'raw sign-out diagnostic'}}; }
    }
  };
}

test('authentication failures remain stable and do not forward provider or session diagnostics', async () => {
  setSupabaseClientForTests(failingClient());
  for (const action of [
    () => signInWithProvider('google'),
    () => getCurrentSession(),
    () => signOut()
  ]) {
    await assert.rejects(action, error => {
      assert.equal(error.code, 'AUTH_FAILED');
      assert.equal(error.message.includes('raw'), false);
      assert.equal(error.message.includes('token'), false);
      return true;
    });
  }
});

test('unsupported authentication providers do not echo caller-provided identifiers', async () => {
  await assert.rejects(
    () => signInWithProvider('untrusted-provider-name'),
    error => error.code === 'AUTH_FAILED' && error.message.includes('untrusted-provider-name') === false
  );
});
