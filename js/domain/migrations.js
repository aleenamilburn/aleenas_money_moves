import {PRODUCT_NAME, STATE_SCHEMA_VERSION} from './constants.js';
import {createUnknownAccount, validateDomainStore, validateBucket} from './models.js';
import {canonicalTransactionFromLegacy, deterministicAllocationId} from '../services/allocationService.js';

const FOUNDATION_MIGRATIONS = [
  {from:1, to:2, id:'v1-preserve-legacy-state', migrate:preserveLegacyState},
  {from:2, to:3, id:'v2-foundation-domain-store', migrate:initializeDomainStore},
  {from:3, to:4, id:'v2-foundation-canonical-name', migrate:initializeFoundationV4},
  {from:4, to:5, id:'v2a-bucket-explorer-fields', migrate:initializeBucketExplorerFields},
  {from:5, to:6, id:'v2a-transaction-allocations', migrate:migrateTraceableLegacyAssignments}
];

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function sourceVersion(input) {
  const version = Number(input?.schemaVersion);
  return Number.isInteger(version) && version > 0 ? version : 1;
}

function isTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function resolveMigrationTimestamp(input, providedNow) {
  if (providedNow !== undefined) {
    if (!isTimestamp(providedNow)) throw new Error('Migration timestamp must be ISO-compatible.');
    return providedNow;
  }
  const asOf = input?.providerSnapshot?.asOf;
  if (typeof asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asOf) && !Number.isNaN(Date.parse(`${asOf}T12:00:00.000Z`))) {
    return `${asOf}T12:00:00.000Z`;
  }
  return '1970-01-01T00:00:00.000Z';
}

function assertValidMigrationState(state, phase) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error(`${phase} state must be an object.`);
  if (state.domain !== undefined) {
    const validation = validateDomainStore(state.domain);
    if (!validation.ok) throw new Error(`${phase} state failed foundation validation: ${validation.errors.join('; ')}`);
  }
}

function toCents(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function isoMonth(value) {
  const candidate = String(value || '').slice(0,7);
  return /^\d{4}-\d{2}$/.test(candidate) ? candidate : 'legacy-unknown-month';
}

function timestampFor(state, fallback) {
  const asOf = state?.providerSnapshot?.asOf;
  return typeof asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asOf) && !Number.isNaN(Date.parse(`${asOf}T12:00:00.000Z`))
    ? `${asOf}T12:00:00.000Z`
    : fallback;
}

function migrationMetadata(state) {
  state.migration = asObject(state.migration);
  state.migration.appliedMigrations = Array.isArray(state.migration.appliedMigrations)
    ? state.migration.appliedMigrations
    : [];
  return state.migration;
}

function preserveLegacyState(state, {now}) {
  state.legacyV1 = asObject(state.legacyV1);
  if (!state.legacyV1.originalSchemaVersion) state.legacyV1.originalSchemaVersion = sourceVersion(state);
  if (Array.isArray(state.categories) && !Array.isArray(state.legacyV1.categories)) state.legacyV1.categories = clone(state.categories);
  if (Array.isArray(state.review?.buckets) && !Array.isArray(state.legacyV1.reviewBuckets)) state.legacyV1.reviewBuckets = clone(state.review.buckets);
  return state;
}

function candidateBuckets(state) {
  const categories = Array.isArray(state.categories) ? state.categories : [];
  const reviewBuckets = Array.isArray(state.legacyV1?.reviewBuckets)
    ? state.legacyV1.reviewBuckets
    : (Array.isArray(state.review?.buckets) ? state.review.buckets : []);
  const seen = new Set();
  return [...categories, ...reviewBuckets].filter(bucket => {
    const id = bucket?.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function legacySnapshotFromCategories(state) {
  const categories = Array.isArray(state.categories) ? state.categories : [];
  if (!categories.some(category => Object.prototype.hasOwnProperty.call(category || {}, 'actual'))) return null;
  const month = isoMonth(state.monthly?.selectedMonth || state.monthly?.activeMonth || state.providerSnapshot?.asOf);
  return {
    id:`legacy-monthly-snapshot-${month}`,
    month,
    label:'Legacy V1 aggregate snapshot — no transaction detail',
    incomeBaselineCents:toCents(state.preferences?.monthlyIncome || state.providerSnapshot?.averageMonthlyIncome),
    bucketActualsCents:Object.fromEntries(categories.map(category => [String(category.id || category.name), toCents(category.actual)])),
    source:'v1-migration'
  };
}

function legacyBalanceSnapshot(state) {
  const snapshot = state.providerSnapshot;
  if (!snapshot?.asOf) return null;
  return {
    id:`legacy-balance-snapshot-${snapshot.asOf}`,
    asOf:snapshot.asOf,
    label:'Legacy V1 balance snapshot — not normalized account history',
    cashTotalCents:toCents(snapshot.cashTotal),
    creditDebtTotalCents:toCents(snapshot.creditDebtTotal),
    netWorthCents:toCents(snapshot.netWorth),
    source:'v1-migration'
  };
}

function initializeDomainStore(state, {now}) {
  const domain = asObject(state.domain);
  domain.accounts = Array.isArray(domain.accounts) ? domain.accounts : [];
  domain.transactions = Array.isArray(domain.transactions) ? domain.transactions : [];
  domain.buckets = Array.isArray(domain.buckets) ? domain.buckets : [];
  domain.allocations = Array.isArray(domain.allocations) ? domain.allocations : [];
  domain.reimbursementClaims = Array.isArray(domain.reimbursementClaims) ? domain.reimbursementClaims : [];
  domain.merchantRules = Array.isArray(domain.merchantRules) ? domain.merchantRules : [];
  domain.auditEvents = Array.isArray(domain.auditEvents) ? domain.auditEvents : [];
  domain.legacyMonthlySnapshots = Array.isArray(domain.legacyMonthlySnapshots) ? domain.legacyMonthlySnapshots : [];
  domain.legacyBalanceSnapshots = Array.isArray(domain.legacyBalanceSnapshots) ? domain.legacyBalanceSnapshots : [];

  if (!domain.accounts.some(account => account?.id === 'unknown-account')) {
    domain.accounts.push(createUnknownAccount(timestampFor(state, now)));
  }

  const existingBucketIds = new Set(domain.buckets.map(bucket => bucket?.id));
  for (const bucket of candidateBuckets(state)) {
    if (!bucket || bucket.system || !bucket.id || existingBucketIds.has(bucket.id)) continue;
    const migrated = {
      id:String(bucket.id),
      parentId:null,
      name:String(bucket.name || bucket.id),
      group:String(bucket.group || 'Uncategorized'),
      order:Number.isSafeInteger(bucket.order) ? bucket.order : domain.buckets.length,
      targetCents:toCents(bucket.target),
      protected:Boolean(bucket.protected),
      active:bucket.active !== false && !bucket.archivedAt,
      description:typeof bucket.description === 'string' ? bucket.description : null,
      archivedAt:bucket.archivedAt || (bucket.active === false ? timestampFor(state, now) : null),
      createdAt:timestampFor(state, now),
      updatedAt:timestampFor(state, now)
    };
    if (validateBucket(migrated).ok) {
      domain.buckets.push(migrated);
      existingBucketIds.add(migrated.id);
    }
  }

  const monthlySnapshot = legacySnapshotFromCategories(state);
  if (monthlySnapshot && !domain.legacyMonthlySnapshots.some(item => item.id === monthlySnapshot.id)) {
    domain.legacyMonthlySnapshots.push(monthlySnapshot);
  }
  const balanceSnapshot = legacyBalanceSnapshot(state);
  if (balanceSnapshot && !domain.legacyBalanceSnapshots.some(item => item.id === balanceSnapshot.id)) {
    domain.legacyBalanceSnapshots.push(balanceSnapshot);
  }
  state.domain = domain;
  return state;
}

function initializeBucketExplorerFields(state) {
  const domain = asObject(state.domain);
  domain.buckets = Array.isArray(domain.buckets) ? domain.buckets : [];
  for (const bucket of domain.buckets) {
    if (!Object.prototype.hasOwnProperty.call(bucket, 'description')) bucket.description = null;
    if (!Object.prototype.hasOwnProperty.call(bucket, 'archivedAt')) bucket.archivedAt = bucket.active === false ? bucket.updatedAt : null;
    bucket.active = bucket.archivedAt ? false : bucket.active !== false;
  }
  state.domain = domain;
  return state;
}

function unresolvedAllocationId(transactionId, bucketId, reason) {
  return `unresolved-${deterministicAllocationId(transactionId || 'missing', bucketId || 'unassigned', reason)}`;
}

function recordUnresolvedAllocation(state, legacy, reason, now) {
  state.legacyV1 = asObject(state.legacyV1);
  state.legacyV1.unresolvedAllocationMigrations = Array.isArray(state.legacyV1.unresolvedAllocationMigrations)
    ? state.legacyV1.unresolvedAllocationMigrations
    : [];
  const item = {
    id:unresolvedAllocationId(legacy?.id, legacy?.bucketId, reason),
    transactionId:typeof legacy?.id === 'string' ? legacy.id : null,
    bucketId:typeof legacy?.bucketId === 'string' ? legacy.bucketId : null,
    reason,
    recordedAt:now
  };
  if (!state.legacyV1.unresolvedAllocationMigrations.some(existing => existing.id === item.id)) {
    state.legacyV1.unresolvedAllocationMigrations.push(item);
  }
}

function migrateTraceableLegacyAssignments(state, {now}) {
  initializeDomainStore(state, {now});
  const domain = state.domain;
  for (const allocation of domain.allocations) {
    if (allocation.ownershipType === 'personal') allocation.ownershipType = 'mine';
  }
  const legacyTransactions = Array.isArray(state.review?.transactions) ? state.review.transactions : [];
  const counts = new Map();
  for (const transaction of legacyTransactions) {
    const id = typeof transaction?.id === 'string' ? transaction.id.trim() : '';
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  const buckets = new Map(domain.buckets.map(bucket => [bucket.id, bucket]));
  const transactions = new Map(domain.transactions.map(transaction => [transaction.id, transaction]));
  const allocationIds = new Set(domain.allocations.map(allocation => allocation.id));

  for (const legacy of legacyTransactions) {
    const transactionId = typeof legacy?.id === 'string' ? legacy.id.trim() : '';
    if (!transactionId) {
      if (legacy?.bucketId) recordUnresolvedAllocation(state, legacy, 'missing_transaction_id', now);
      continue;
    }
    if (counts.get(transactionId) !== 1) {
      recordUnresolvedAllocation(state, legacy, 'duplicate_transaction_id', now);
      continue;
    }
    let transaction = transactions.get(transactionId);
    const knownAccount = domain.accounts.some(account => account.id === legacy.accountId) ? legacy.accountId : undefined;
    const migratedTransaction = canonicalTransactionFromLegacy(legacy, {now, accountId:knownAccount});
    if (!migratedTransaction) {
      recordUnresolvedAllocation(state, legacy, 'invalid_or_zero_transaction_amount', now);
      continue;
    }
    if (transaction && Math.abs(transaction.amountCents) !== Math.abs(migratedTransaction.amountCents)) {
      recordUnresolvedAllocation(state, legacy, 'canonical_amount_mismatch', now);
      continue;
    }
    if (!transaction) {
      transaction = migratedTransaction;
      domain.transactions.push(transaction);
      transactions.set(transaction.id, transaction);
    }
    if (!legacy.bucketId || domain.allocations.some(allocation => allocation.transactionId === transactionId)) continue;

    const selected = buckets.get(legacy.bucketId);
    if (!selected) {
      recordUnresolvedAllocation(state, legacy, 'missing_or_system_bucket', now);
      continue;
    }
    const parent = selected.parentId ? buckets.get(selected.parentId) : selected;
    if (!parent || parent.parentId) {
      recordUnresolvedAllocation(state, legacy, 'invalid_bucket_hierarchy', now);
      continue;
    }
    const subBucketId = selected.parentId ? selected.id : null;
    const allocationId = deterministicAllocationId(transactionId, parent.id, subBucketId);
    if (allocationIds.has(allocationId)) {
      recordUnresolvedAllocation(state, legacy, 'allocation_id_collision', now);
      continue;
    }
    domain.allocations.push({
      id:allocationId,
      transactionId,
      bucketId:parent.id,
      subBucketId,
      amountCents:Math.abs(transaction.amountCents),
      ownershipType:'mine',
      note:null,
      reimbursementClaimId:null,
      createdAt:now,
      updatedAt:now
    });
    allocationIds.add(allocationId);
  }
  return state;
}

function initializeFoundationV4(state, context) {
  initializeDomainStore(state, context);
  state.app = {...asObject(state.app), name:PRODUCT_NAME};
  state.migration = asObject(state.migration);
  state.migration.foundation = 'v2';
  return state;
}

export function migrateState(input, {now} = {}) {
  const state = clone(input || {});
  const migrationNow = resolveMigrationTimestamp(state, now);
  const fromVersion = sourceVersion(state);
  if (fromVersion > STATE_SCHEMA_VERSION) {
    throw new Error(`Vault schema ${fromVersion} is newer than supported schema ${STATE_SCHEMA_VERSION}.`);
  }
  assertValidMigrationState(state, 'Pre-migration');
  const applied = [];
  let version = fromVersion;
  while (version < STATE_SCHEMA_VERSION) {
    const migration = FOUNDATION_MIGRATIONS.find(item => item.from === version);
    if (!migration) throw new Error(`No migration is available from schema ${version}.`);
    migration.migrate(state, {now:migrationNow});
    const metadata = migrationMetadata(state);
    if (!metadata.appliedMigrations.includes(migration.id)) metadata.appliedMigrations.push(migration.id);
    version = migration.to;
    state.schemaVersion = version;
    applied.push(migration.id);
  }
  initializeFoundationV4(state, {now:migrationNow});
  state.schemaVersion = STATE_SCHEMA_VERSION;
  state.app = {...asObject(state.app), name:PRODUCT_NAME};
  assertValidMigrationState(state, 'Post-migration');
  return {state, fromVersion, toVersion:STATE_SCHEMA_VERSION, applied, changed:applied.length > 0};
}

export function validateFoundationDomain(domain) {
  return validateDomainStore(domain);
}
