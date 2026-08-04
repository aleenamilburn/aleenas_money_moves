import {createClient} from '../vendor/supabase-js/index.mjs';

let cachedClient = null;

export class HostedStorageNotConfiguredError extends Error {
  constructor() {
    super('Hosted storage is not configured for this deployment.');
    this.name = 'HostedStorageNotConfiguredError';
    this.code = 'HOSTED_STORAGE_NOT_CONFIGURED';
  }
}

export function readSupabaseConfig() {
  const config = globalThis.MONEY_MOVES_SUPABASE_CONFIG;
  if (!config || typeof config.url !== 'string' || !config.url || typeof config.anonKey !== 'string' || !config.anonKey) {
    return null;
  }
  return {url: config.url, anonKey: config.anonKey};
}

export function isHostedStorageConfigured() {
  return readSupabaseConfig() !== null;
}

export function getSupabaseClient() {
  if (cachedClient) return cachedClient;
  const config = readSupabaseConfig();
  if (!config) throw new HostedStorageNotConfiguredError();
  cachedClient = createClient(config.url, config.anonKey, {
    auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}
  });
  return cachedClient;
}

// Test-only: allows a fake client to be substituted without touching the config/module cache contract above.
export function setSupabaseClientForTests(client) {
  cachedClient = client;
}
