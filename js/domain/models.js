import {DEFAULT_CURRENCY, UNKNOWN_ACCOUNT_ID} from './constants.js';

export const ACCOUNT_TYPES = new Set(['cash', 'credit', 'loan', 'savings', 'investment', 'unknown']);
export const TRANSACTION_SOURCES = new Set(['manual', 'csv', 'migration']);
export const PENDING_STATUSES = new Set(['pending', 'posted', 'removed', 'unknown']);
export const MOVEMENT_TYPES = new Set([
  'expense', 'earned_income', 'reimbursement', 'merchant_refund', 'internal_transfer',
  'gift', 'debt_payment', 'savings_contribution', 'interest', 'sale_proceeds',
  'other_inflow', 'other', 'excluded'
]);
export const REVIEW_STATUSES = new Set(['pending', 'suggested', 'deferred', 'reviewed', 'needs_resolution']);
export const OWNERSHIP_TYPES = new Set(['personal', 'reimbursable', 'shared', 'excluded']);
export const CLAIM_STATUSES = new Set(['open', 'partial', 'settled', 'overpaid', 'overdue', 'written_off', 'cancelled']);

export class ModelValidationError extends Error {
  constructor(modelName, errors) {
    super(`${modelName} is invalid: ${errors.join('; ')}`);
    this.name = 'ModelValidationError';
    this.modelName = modelName;
    this.errors = errors;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value, field, errors) {
  if (typeof value !== 'string' || !value.trim()) errors.push(`${field} must be a non-empty string`);
}

function optionalString(value, field, errors) {
  if (value !== undefined && value !== null && typeof value !== 'string') errors.push(`${field} must be a string or null`);
}

function optionalObject(value, field, errors) {
  if (value !== undefined && value !== null && !isPlainObject(value)) errors.push(`${field} must be an object or null`);
}

function requiredBoolean(value, field, errors) {
  if (typeof value !== 'boolean') errors.push(`${field} must be a boolean`);
}

function requiredInteger(value, field, errors, {min = Number.MIN_SAFE_INTEGER, nonZero = false} = {}) {
  if (!Number.isSafeInteger(value)) errors.push(`${field} must be a safe integer`);
  else if (value < min) errors.push(`${field} must be at least ${min}`);
  else if (nonZero && value === 0) errors.push(`${field} must not be zero`);
}

function optionalInteger(value, field, errors, {min = Number.MIN_SAFE_INTEGER} = {}) {
  if (value !== undefined && value !== null) requiredInteger(value, field, errors, {min});
}

function requiredEnum(value, field, allowed, errors) {
  if (!allowed.has(value)) errors.push(`${field} must be one of: ${[...allowed].join(', ')}`);
}

function requiredTimestamp(value, field, errors) {
  requiredString(value, field, errors);
  if (typeof value === 'string' && Number.isNaN(Date.parse(value))) errors.push(`${field} must be an ISO-compatible timestamp`);
}

function optionalDate(value, field, errors) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) errors.push(`${field} must be an ISO-compatible date or null`);
}

function requiredCurrency(value, errors) {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) errors.push('currency must be a three-letter uppercase ISO code');
}

function validationResult(modelName, value, errors) {
  return {ok: errors.length === 0, modelName, value, errors};
}

function validateBaseEntity(value, modelName, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${modelName} must be an object`);
    return false;
  }
  requiredString(value.id, 'id', errors);
  requiredTimestamp(value.createdAt, 'createdAt', errors);
  requiredTimestamp(value.updatedAt, 'updatedAt', errors);
  return true;
}

export function validateAccount(value) {
  const errors = [];
  if (!validateBaseEntity(value, 'Account', errors)) return validationResult('Account', value, errors);
  optionalString(value.institutionId, 'institutionId', errors);
  optionalString(value.externalAccountId, 'externalAccountId', errors);
  requiredString(value.friendlyName, 'friendlyName', errors);
  optionalString(value.officialName, 'officialName', errors);
  optionalString(value.mask, 'mask', errors);
  requiredEnum(value.type, 'type', ACCOUNT_TYPES, errors);
  optionalString(value.subtype, 'subtype', errors);
  requiredCurrency(value.currency, errors);
  requiredEnum(value.source, 'source', new Set(['manual', 'csv', 'migration', 'system']), errors);
  requiredBoolean(value.active, 'active', errors);
  optionalInteger(value.balanceCents, 'balanceCents', errors);
  return validationResult('Account', value, errors);
}

export function validateTransaction(value) {
  const errors = [];
  if (!validateBaseEntity(value, 'Transaction', errors)) return validationResult('Transaction', value, errors);
  requiredString(value.accountId, 'accountId', errors);
  requiredEnum(value.source, 'source', TRANSACTION_SOURCES, errors);
  optionalString(value.sourceTransactionId, 'sourceTransactionId', errors);
  optionalString(value.rawName, 'rawName', errors);
  optionalString(value.merchantName, 'merchantName', errors);
  requiredInteger(value.amountCents, 'amountCents', errors, {nonZero:true});
  requiredCurrency(value.currency, errors);
  optionalDate(value.authorizedAt, 'authorizedAt', errors);
  optionalDate(value.postedAt, 'postedAt', errors);
  optionalDate(value.displayDate, 'displayDate', errors);
  requiredEnum(value.pendingStatus, 'pendingStatus', PENDING_STATUSES, errors);
  requiredEnum(value.movementType, 'movementType', MOVEMENT_TYPES, errors);
  requiredEnum(value.reviewStatus, 'reviewStatus', REVIEW_STATUSES, errors);
  optionalString(value.locationRegion, 'locationRegion', errors);
  optionalString(value.locationCountry, 'locationCountry', errors);
  optionalString(value.locationSource, 'locationSource', errors);
  optionalString(value.providerCategory, 'providerCategory', errors);
  optionalObject(value.manualOverrides, 'manualOverrides', errors);
  return validationResult('Transaction', value, errors);
}

export function validateBucket(value) {
  const errors = [];
  if (!validateBaseEntity(value, 'Bucket', errors)) return validationResult('Bucket', value, errors);
  optionalString(value.parentId, 'parentId', errors);
  requiredString(value.name, 'name', errors);
  requiredString(value.group, 'group', errors);
  requiredInteger(value.order, 'order', errors, {min:0});
  requiredInteger(value.targetCents, 'targetCents', errors, {min:0});
  requiredBoolean(value.protected, 'protected', errors);
  requiredBoolean(value.active, 'active', errors);
  return validationResult('Bucket', value, errors);
}

export function validateAllocation(value) {
  const errors = [];
  if (!validateBaseEntity(value, 'Allocation', errors)) return validationResult('Allocation', value, errors);
  requiredString(value.transactionId, 'transactionId', errors);
  requiredString(value.bucketId, 'bucketId', errors);
  optionalString(value.subBucketId, 'subBucketId', errors);
  requiredInteger(value.amountCents, 'amountCents', errors, {min:1});
  requiredEnum(value.ownershipType, 'ownershipType', OWNERSHIP_TYPES, errors);
  optionalString(value.note, 'note', errors);
  optionalString(value.reimbursementClaimId, 'reimbursementClaimId', errors);
  return validationResult('Allocation', value, errors);
}

export function validateReimbursementClaim(value) {
  const errors = [];
  if (!validateBaseEntity(value, 'ReimbursementClaim', errors)) return validationResult('ReimbursementClaim', value, errors);
  requiredString(value.payerLabel, 'payerLabel', errors);
  requiredInteger(value.expectedAmountCents, 'expectedAmountCents', errors, {min:1});
  requiredEnum(value.status, 'status', CLAIM_STATUSES, errors);
  optionalDate(value.dueDate, 'dueDate', errors);
  optionalString(value.note, 'note', errors);
  if (!Array.isArray(value.allocationIds)) errors.push('allocationIds must be an array');
  else {
    const allocationIds = new Set();
    value.allocationIds.forEach((id, index) => {
      requiredString(id, `allocationIds[${index}]`, errors);
      if (typeof id === 'string' && allocationIds.has(id)) errors.push(`allocationIds[${index}] must not duplicate another allocation id`);
      allocationIds.add(id);
    });
  }
  if (!Array.isArray(value.repaymentLinks)) errors.push('repaymentLinks must be an array');
  else value.repaymentLinks.forEach((link, index) => {
    if (!isPlainObject(link)) errors.push(`repaymentLinks[${index}] must be an object`);
    else {
      requiredString(link.transactionId, `repaymentLinks[${index}].transactionId`, errors);
      requiredInteger(link.amountCents, `repaymentLinks[${index}].amountCents`, errors, {min:1});
    }
  });
  return validationResult('ReimbursementClaim', value, errors);
}

export function validateMerchantRule(value) {
  const errors = [];
  if (!validateBaseEntity(value, 'MerchantRule', errors)) return validationResult('MerchantRule', value, errors);
  requiredString(value.merchantKey, 'merchantKey', errors);
  if (!isPlainObject(value.conditions)) errors.push('conditions must be an object');
  if (!isPlainObject(value.action)) errors.push('action must be an object');
  else optionalString(value.action.bucketId, 'action.bucketId', errors);
  requiredBoolean(value.active, 'active', errors);
  optionalString(value.lastUsedAt, 'lastUsedAt', errors);
  optionalInteger(value.matchCount, 'matchCount', errors, {min:0});
  return validationResult('MerchantRule', value, errors);
}

export function assertValid(result) {
  if (!result.ok) throw new ModelValidationError(result.modelName, result.errors);
  return result.value;
}

export function validateBucketTree(buckets) {
  const errors = [];
  if (!Array.isArray(buckets)) return validationResult('BucketTree', buckets, ['buckets must be an array']);
  const byId = new Map();
  for (const bucket of buckets) {
    const result = validateBucket(bucket);
    if (!result.ok) errors.push(...result.errors.map(error => `${bucket?.id || 'unknown'}: ${error}`));
    else if (byId.has(bucket.id)) errors.push(`duplicate bucket id: ${bucket.id}`);
    else byId.set(bucket.id, bucket);
  }
  for (const bucket of byId.values()) {
    if (!bucket.parentId) continue;
    const parent = byId.get(bucket.parentId);
    if (!parent) errors.push(`bucket ${bucket.id} references missing parent ${bucket.parentId}`);
    else if (parent.id === bucket.id) errors.push(`bucket ${bucket.id} cannot be its own parent`);
    else if (parent.parentId) errors.push(`bucket ${bucket.id} would create a third nesting level`);
  }
  return validationResult('BucketTree', buckets, errors);
}

export function validateAllocationsForTransaction(allocations, transactionAmountCents) {
  const errors = [];
  if (!Number.isSafeInteger(transactionAmountCents) || transactionAmountCents === 0) errors.push('transactionAmountCents must be a non-zero safe integer');
  if (!Array.isArray(allocations) || allocations.length === 0) errors.push('allocations must contain at least one item');
  else {
    for (const allocation of allocations) {
      const result = validateAllocation(allocation);
      if (!result.ok) errors.push(...result.errors.map(error => `${allocation?.id || 'unknown'}: ${error}`));
    }
    const total = allocations.reduce((sum, allocation) => sum + Number(allocation?.amountCents || 0), 0);
    if (total !== Math.abs(transactionAmountCents)) errors.push(`allocation total ${total} must equal transaction magnitude ${Math.abs(transactionAmountCents)}`);
  }
  return validationResult('AllocationSet', allocations, errors);
}

export function validateDomainStore(domain) {
  const errors = [];
  if (!isPlainObject(domain)) return validationResult('DomainStore', domain, ['domain must be an object']);
  const modelCollections = [
    ['accounts', validateAccount],
    ['transactions', validateTransaction],
    ['buckets', validateBucket],
    ['allocations', validateAllocation],
    ['reimbursementClaims', validateReimbursementClaim],
    ['merchantRules', validateMerchantRule]
  ];
  for (const [field, validator] of modelCollections) {
    if (!Array.isArray(domain[field])) {
      errors.push(`${field} must be an array`);
      continue;
    }
    for (const item of domain[field]) {
      const result = validator(item);
      if (!result.ok) errors.push(...result.errors.map(error => `${field}.${item?.id || 'unknown'}: ${error}`));
    }
    const ids = new Set();
    for (const item of domain[field]) {
      if (typeof item?.id !== 'string' || !item.id) continue;
      if (ids.has(item.id)) errors.push(`${field} contains duplicate id ${item.id}`);
      ids.add(item.id);
    }
  }
  if (errors.length) return validationResult('DomainStore', domain, errors);

  const accountIds = new Set(domain.accounts.map(account => account.id));
  const transactionIds = new Set(domain.transactions.map(transaction => transaction.id));
  const bucketIds = new Set(domain.buckets.map(bucket => bucket.id));
  const allocationIds = new Set(domain.allocations.map(allocation => allocation.id));
  for (const transaction of domain.transactions) {
    if (!accountIds.has(transaction.accountId)) errors.push(`transaction ${transaction.id} references missing account ${transaction.accountId}`);
    const allocations = domain.allocations.filter(allocation => allocation.transactionId === transaction.id);
    if (allocations.length) {
      const allocationValidation = validateAllocationsForTransaction(allocations, transaction.amountCents);
      if (!allocationValidation.ok) errors.push(...allocationValidation.errors.map(error => `transaction ${transaction.id}: ${error}`));
    }
  }
  for (const allocation of domain.allocations) {
    if (!transactionIds.has(allocation.transactionId)) errors.push(`allocation ${allocation.id} references missing transaction ${allocation.transactionId}`);
    if (!bucketIds.has(allocation.bucketId)) errors.push(`allocation ${allocation.id} references missing bucket ${allocation.bucketId}`);
    if (allocation.subBucketId) {
      const subBucket = domain.buckets.find(bucket => bucket.id === allocation.subBucketId);
      if (!subBucket) errors.push(`allocation ${allocation.id} references missing sub-bucket ${allocation.subBucketId}`);
      else if (subBucket.parentId !== allocation.bucketId) errors.push(`allocation ${allocation.id} sub-bucket ${allocation.subBucketId} must be a child of ${allocation.bucketId}`);
    }
  }
  const claimsById = new Map(domain.reimbursementClaims.map(claim => [claim.id, claim]));
  for (const allocation of domain.allocations) {
    if (!allocation.reimbursementClaimId) continue;
    const claim = claimsById.get(allocation.reimbursementClaimId);
    if (!claim) errors.push(`allocation ${allocation.id} references missing reimbursement claim ${allocation.reimbursementClaimId}`);
    else if (!claim.allocationIds.includes(allocation.id)) errors.push(`allocation ${allocation.id} is not listed by reimbursement claim ${claim.id}`);
  }
  for (const claim of domain.reimbursementClaims) {
    for (const allocationId of claim.allocationIds) {
      if (!allocationIds.has(allocationId)) errors.push(`claim ${claim.id} references missing allocation ${allocationId}`);
      else {
        const allocation = domain.allocations.find(item => item.id === allocationId);
        if (allocation.reimbursementClaimId !== claim.id) errors.push(`claim ${claim.id} allocation ${allocationId} must reference the same claim`);
      }
    }
    for (const repayment of claim.repaymentLinks) {
      if (!transactionIds.has(repayment.transactionId)) errors.push(`claim ${claim.id} links missing repayment transaction ${repayment.transactionId}`);
      else {
        const transaction = domain.transactions.find(item => item.id === repayment.transactionId);
        if (transaction.amountCents <= 0 || transaction.movementType !== 'reimbursement') {
          errors.push(`claim ${claim.id} repayment transaction ${repayment.transactionId} must be a reimbursement inflow`);
        }
      }
    }
  }
  for (const rule of domain.merchantRules) {
    if (typeof rule.action.bucketId === 'string' && !bucketIds.has(rule.action.bucketId)) {
      errors.push(`merchant rule ${rule.id} targets missing bucket ${rule.action.bucketId}`);
    }
  }
  const tree = validateBucketTree(domain.buckets);
  if (!tree.ok) errors.push(...tree.errors);
  return validationResult('DomainStore', domain, errors);
}

export function createUnknownAccount(timestamp = '1970-01-01T00:00:00.000Z') {
  return {
    id: UNKNOWN_ACCOUNT_ID,
    institutionId: null,
    externalAccountId: null,
    friendlyName: 'Unknown account',
    officialName: null,
    mask: null,
    type: 'unknown',
    subtype: null,
    currency: DEFAULT_CURRENCY,
    source: 'system',
    active: true,
    balanceCents: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
