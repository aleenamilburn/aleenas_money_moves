import assert from 'node:assert/strict';
import test from 'node:test';
import {readSupabaseConfig} from '../js/services/supabaseClient.js';

function withConfig(config, action) {
  const previous = globalThis.MONEY_MOVES_SUPABASE_CONFIG;
  globalThis.MONEY_MOVES_SUPABASE_CONFIG = config;
  try { return action(); }
  finally {
    if (previous === undefined) delete globalThis.MONEY_MOVES_SUPABASE_CONFIG;
    else globalThis.MONEY_MOVES_SUPABASE_CONFIG = previous;
  }
}

test('hosted configuration accepts only a base HTTPS project URL and a browser-safe public key shape', () => {
  withConfig({url:'https://example.supabase.co', anonKey:'sb_publishable_example'}, () => {
    assert.deepEqual(readSupabaseConfig(), {url:'https://example.supabase.co', anonKey:'sb_publishable_example'});
  });
  withConfig({url:'https://example.supabase.co/rest/v1/', anonKey:'sb_publishable_example'}, () => assert.equal(readSupabaseConfig(), null));
  withConfig({url:'http://example.supabase.co', anonKey:'sb_publishable_example'}, () => assert.equal(readSupabaseConfig(), null));
  withConfig({url:'https://example.supabase.co', anonKey:'sb_secret_do_not_use'}, () => assert.equal(readSupabaseConfig(), null));
});
