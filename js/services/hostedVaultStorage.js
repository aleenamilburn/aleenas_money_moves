import {getSupabaseClient} from './supabaseClient.js';
import {getCurrentUserId} from './authService.js';

const TABLE = 'vaults';
const BROADCAST_CHANNEL_NAME = 'money-moves-vault-v2-remote-write';

export class HostedVaultAuthRequiredError extends Error {
  constructor() {
    super('Sign in before the encrypted vault can be reached.');
    this.name = 'HostedVaultAuthRequiredError';
    this.code = 'HOSTED_VAULT_AUTH_REQUIRED';
  }
}

// Mirrors VaultConflictError's contract (code 'VAULT_CONFLICT') so callers in vault.js
// can treat a hosted conflict identically to the existing same-device conflict path.
export class HostedVaultConflictError extends Error {
  constructor(currentGeneration = null) {
    super('Money Moves was updated elsewhere. Reload before saving.');
    this.name = 'HostedVaultConflictError';
    this.code = 'VAULT_CONFLICT';
    this.currentGeneration = currentGeneration;
  }
}

// Thrown when a write's outcome could not be determined even after reconciliation
// (the reconciling read itself failed). Retryable: no state was left torn either way,
// because the underlying write is one atomic Postgres statement.
export class HostedVaultNetworkError extends Error {
  constructor(operation) {
    super('The hosted vault could not be reached. No change was saved.');
    this.name = 'HostedVaultNetworkError';
    this.code = 'HOSTED_VAULT_NETWORK_FAILED';
    this.operation = operation;
  }
}

function broadcastChannel() {
  if (typeof BroadcastChannel === 'undefined') return null;
  return new BroadcastChannel(BROADCAST_CHANNEL_NAME);
}

// Same-device-only early warning, replacing the native `storage` event that never
// fires once the vault leaves localStorage. Advisory only, exactly like the event
// it replaces — the authoritative check is always the conditional write itself.
export function subscribeToRemoteWrites(callback) {
  const channel = broadcastChannel();
  if (!channel) return () => {};
  const handler = event => { if (event?.data?.type === 'vault-written') callback(); };
  channel.addEventListener('message', handler);
  return () => { channel.removeEventListener('message', handler); channel.close(); };
}

function announceRemoteWrite() {
  const channel = broadcastChannel();
  if (!channel) return;
  channel.postMessage({type: 'vault-written', at: Date.now()});
  channel.close();
}

async function requireUserId() {
  const userId = await getCurrentUserId();
  if (!userId) throw new HostedVaultAuthRequiredError();
  return userId;
}

async function readRowForUser(userId) {
  const supabase = getSupabaseClient();
  let response;
  try {
    response = await supabase.from(TABLE).select('generation, blob').eq('user_id', userId).maybeSingle();
  } catch {
    throw new HostedVaultNetworkError('read');
  }
  if (response.error) throw new HostedVaultNetworkError('read');
  return response.data ? {userId, generation: response.data.generation, blob: response.data.blob} : null;
}

export async function readHostedRow() {
  const userId = await requireUserId();
  return readRowForUser(userId);
}

// Shared write path for both first-time creation (insert) and conditional update.
// Three-way outcome, in order of preference:
//   1. The request succeeded and returned exactly the row we wrote -> definite success.
//   2. The request reached the server and definitely did not apply (empty result, no
//      thrown error) -> definite conflict. Only possible for the conditional update,
//      since its WHERE clause is what can match zero rows.
//   3. Anything else (thrown/network error, or an insert's unique-violation error,
//      which is ambiguous because a retried insert that already landed looks the
//      same as a genuine collision) -> reconcile with one follow-up read. The read's
//      result disambiguates: our own generation present -> our write landed after
//      all; the old expected generation still present -> our write never landed and
//      is safe to retry; anything else -> a different writer really did win.
async function performWrite(userId, {attemptedGeneration, expectedGeneration, run}) {
  let response;
  try {
    response = await run();
  } catch {
    return reconcile(userId, attemptedGeneration, expectedGeneration);
  }
  if (response.error) return reconcile(userId, attemptedGeneration, expectedGeneration);
  if (Array.isArray(response.data) && response.data.length === 0) {
    throw new HostedVaultConflictError();
  }
  // A response is authoritative only when PostgREST returns the exact generation
  // this operation attempted. Treat malformed or mismatched acknowledgements like
  // an interrupted response and reconcile with a fresh RLS-scoped read.
  if (!Array.isArray(response.data) || response.data.length !== 1 || response.data[0]?.generation !== attemptedGeneration) {
    return reconcile(userId, attemptedGeneration, expectedGeneration);
  }
  announceRemoteWrite();
  return {userId, generation: attemptedGeneration};
}

async function reconcile(userId, attemptedGeneration, expectedGeneration) {
  let current;
  try {
    current = await readRowForUser(userId);
  } catch {
    throw new HostedVaultNetworkError('write');
  }
  if (current && current.generation === attemptedGeneration) {
    announceRemoteWrite();
    return {userId, generation: attemptedGeneration};
  }
  const writeNeverLanded = (current === null && expectedGeneration === null)
    || (current && current.generation === expectedGeneration);
  if (writeNeverLanded) throw new HostedVaultNetworkError('write');
  throw new HostedVaultConflictError(current?.generation ?? null);
}

export async function createHostedRow({generation, blob}) {
  const userId = await requireUserId();
  return performWrite(userId, {
    attemptedGeneration: generation,
    expectedGeneration: null,
    run: () => getSupabaseClient().from(TABLE).insert({user_id: userId, generation, blob}).select('generation')
  });
}

export async function updateHostedRow({expectedGeneration, nextGeneration, blob}) {
  const userId = await requireUserId();
  return performWrite(userId, {
    attemptedGeneration: nextGeneration,
    expectedGeneration,
    run: () => getSupabaseClient().from(TABLE)
      .update({generation: nextGeneration, blob, updated_at: new Date().toISOString()})
      .eq('user_id', userId)
      .eq('generation', expectedGeneration)
      .select('generation')
  });
}
