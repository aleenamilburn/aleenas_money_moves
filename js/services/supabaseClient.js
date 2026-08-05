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
  try {
    const url = new URL(config.url);
    const isLocalDevelopment = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((!isLocalDevelopment && url.protocol !== 'https:') || (isLocalDevelopment && !['http:', 'https:'].includes(url.protocol))) return null;
    if (url.pathname !== '/' || url.search || url.hash) return null;
    if (config.anonKey.startsWith('sb_secret_') || isLegacyServiceRoleKey(config.anonKey)) return null;
    return {url:url.origin, anonKey: config.anonKey};
  } catch {
    return null;
  }
}

function isLegacyServiceRoleKey(key) {
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
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
