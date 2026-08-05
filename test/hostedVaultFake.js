// A minimal fake of the two Supabase call shapes js/services/hostedVaultStorage.js
// actually uses (select().eq().maybeSingle(), insert().select(), update().eq().eq()
// .select()) plus auth.getSession(). It is not a general PostgREST emulator -- it
// implements exactly enough of the real client's surface to exercise the atomic
// conditional-write contract, including its ambiguous-failure paths.
//
// Multiple `client()` calls against the same createFakeVaultsTable() instance share
// one backing Map, so two independently-driven clients (simulating either two tabs
// on one device or two entirely separate devices -- this fake makes no distinction,
// which mirrors reality: the database cannot tell them apart either) race against
// the same rows exactly as two real browsers would against the same Postgres table.

export function createFakeVaultsTable() {
  const rows = new Map(); // user_id -> {generation, blob, updated_at}

  function client(userId, {failMode = null} = {}) {
    // failMode is one-shot: it affects only the next write this client issues, then
    // resets to null so a retry (or an unrelated later write) is not also affected.
    let pendingFailMode = failMode;

    function runWrite(apply) {
      const mode = pendingFailMode;
      pendingFailMode = null;
      if (mode === 'before-apply') {
        // Simulates both "request never left the client" and "request was lost/
        // timed out before the server processed it" -- indistinguishable from the
        // client's side, and correctly resolved the same way by reconciliation:
        // the table is untouched, so a retry with the same attempted generation
        // is safe.
        return Promise.reject(new Error('simulated network failure before the write was applied'));
      }
      const result = apply(); // mutates `rows` first if it's a genuine match
      if (mode === 'after-apply') {
        // Simulates "the server committed the write but the response never made it
        // back" -- the one case with no localStorage analog. `rows` already
        // reflects the committed write; the promise still rejects.
        return Promise.reject(new Error('simulated network failure after the write was committed'));
      }
      if (mode === 'malformed-response') {
        // The database applied the mutation but a proxy/client returned an
        // acknowledgement that cannot be trusted. Production must reconcile.
        return Promise.resolve({data: [{generation: 'untrusted-response'}], error: null});
      }
      return Promise.resolve(result);
    }

    return {
      auth: {
        async getSession() {
          return {data: {session: userId ? {user: {id: userId}} : null}, error: null};
        }
      },
      from(table) {
        if (table === 'plaid_secrets') {
          // RLS is enabled with no browser policy for this future-only table.
          return {
            select() { return {eq() { return {async maybeSingle() { return {data:null, error:null}; }}; }}; },
            insert() { return {select: async () => ({data:null, error:{code:'42501'}})}; },
            update() { return {eq() { return {select: async () => ({data:[], error:null})}; }}; },
            delete() { return {eq() { return {select: async () => ({data:[], error:null})}; }}; }
          };
        }
        if (table !== 'vaults') throw new Error(`fake client only supports the vaults table, got "${table}"`);
        return {
          select() {
            return {
              eq(key, value) {
                if (key !== 'user_id') throw new Error('fake only supports .eq("user_id", ...) for select');
                return {
                  async maybeSingle() {
                    const row = userId && value === userId ? rows.get(value) : null;
                    return {data: row ? {generation: row.generation, blob: row.blob} : null, error: null};
                  }
                };
              }
            };
          },
          insert(record) {
            return {
              select: () => runWrite(() => {
                if (!userId || record.user_id !== userId) return {data: null, error: {code:'42501'}};
                if (rows.has(record.user_id)) {
                  return {data: null, error: {message: 'duplicate key value violates unique constraint "vaults_pkey"'}};
                }
                rows.set(record.user_id, {generation: record.generation, blob: record.blob, updated_at: new Date().toISOString()});
                return {data: [{generation: record.generation}], error: null};
              })
            };
          },
          update(patch) {
            const filters = [];
            const builder = {
              eq(key, value) { filters.push([key, value]); return builder; },
              select: () => runWrite(() => {
                const userIdFilter = filters.find(([key]) => key === 'user_id');
                const generationFilter = filters.find(([key]) => key === 'generation');
                const row = userId && userIdFilter?.[1] === userId ? rows.get(userIdFilter[1]) : undefined;
                if (!row || (generationFilter && row.generation !== generationFilter[1])) {
                  return {data: [], error: null}; // WHERE matched nothing: definite conflict
                }
                rows.set(userIdFilter[1], {generation: patch.generation, blob: patch.blob, updated_at: patch.updated_at});
                return {data: [{generation: patch.generation}], error: null};
              })
            };
            return builder;
          },
          delete() {
            // `vaults` deliberately has no DELETE policy. Even its owner gets no
            // matching row through the browser role.
            return {eq() { return {select: async () => ({data:[], error:null})}; }};
          }
        };
      }
    };
  }

  return {rows, client};
}
