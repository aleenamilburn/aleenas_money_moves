import {
  DEVOTIONAL_PRIVATE_NOTES_MAX_CHARS,
  DEVOTIONAL_RESPONSE_MAX_CHARS
} from '../domain/constants.js';
import {validateDomainStore} from '../domain/models.js';
import {
  DEVOTIONAL_CONTENT_VERSION,
  FAITH_MONEY_DEVOTIONALS,
  devotionalById
} from '../content/faithMoneyDevotionals.js';
import {advanceStateRevision, getStateRevision} from './stateRevision.js';

export const DEVOTIONAL_ERROR_CODES = Object.freeze({
  STALE_STATE:'STALE_STATE',
  DEVOTIONAL_NOT_FOUND:'DEVOTIONAL_NOT_FOUND',
  INVALID_DRAFT:'INVALID_DRAFT',
  INVALID_RESPONSE:'INVALID_RESPONSE',
  INVALID_PRIVATE_NOTES:'INVALID_PRIVATE_NOTES',
  ACTIVE_DEVOTIONAL_REQUIRED:'ACTIVE_DEVOTIONAL_REQUIRED',
  DEVOTIONAL_ALREADY_COMPLETED:'DEVOTIONAL_ALREADY_COMPLETED',
  ACTIVE_DEVOTIONAL_NOT_COMPLETE:'ACTIVE_DEVOTIONAL_NOT_COMPLETE',
  NO_NEXT_DEVOTIONAL:'NO_NEXT_DEVOTIONAL',
  PERSISTENCE_FAILED:'PERSISTENCE_FAILED',
  DOMAIN_INVALID:'DOMAIN_INVALID',
  INVALID_OPERATION:'INVALID_OPERATION'
});

export class DevotionalServiceError extends Error {
  constructor(message, code = DEVOTIONAL_ERROR_CODES.INVALID_OPERATION, details = null) {
    super(message);
    this.name = 'DevotionalServiceError';
    this.code = code;
    this.details = details;
  }
}

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function serviceError(code, message, details = null) {
  return new DevotionalServiceError(message, code, details);
}

function restoreObject(target, snapshot) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, snapshot);
}

function isTimestamp(value) {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value));
}

function nowFrom(options) {
  const value = typeof options?.now === 'function' ? options.now() : options?.now;
  if (value !== undefined && !isTimestamp(value)) {
    throw serviceError(DEVOTIONAL_ERROR_CODES.INVALID_OPERATION, 'The devotional timestamp is invalid.');
  }
  return value || new Date().toISOString();
}

function domain(state) {
  const d = state?.domain;
  const devotionalState = d?.devotionalState;
  if (!d || !devotionalState || !Array.isArray(devotionalState.entries)
    || !Array.isArray(devotionalState.completedDevotionalIds) || !Array.isArray(devotionalState.savedDevotionalIds)) {
    throw serviceError(DEVOTIONAL_ERROR_CODES.DOMAIN_INVALID, 'Devotional data is unavailable.');
  }
  return d;
}

function devotionalState(state) {
  return domain(state).devotionalState;
}

function assertDomainValid(state) {
  const validation = validateDomainStore(domain(state), {legacyDevotionalState:false});
  if (!validation.ok) {
    throw serviceError(DEVOTIONAL_ERROR_CODES.DOMAIN_INVALID, 'The devotional state is invalid.');
  }
}

function assertExpectedRevision(state, expectedRevision) {
  const currentRevision = getStateRevision(state);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision !== currentRevision) {
    throw serviceError(
      DEVOTIONAL_ERROR_CODES.STALE_STATE,
      'This devotional draft is out of date. Reload the latest saved state before trying again.',
      {expectedRevision, currentRevision}
    );
  }
  return currentRevision;
}

function contentFor(devotionalId) {
  const content = devotionalById(devotionalId);
  if (!content) {
    throw serviceError(DEVOTIONAL_ERROR_CODES.DEVOTIONAL_NOT_FOUND, 'This devotional is unavailable.');
  }
  return content;
}

function entryFor(d, devotionalId) {
  return d.devotionalState.entries.find(entry => entry.devotionalId === devotionalId) || null;
}

function requiredText(value, maximum, errorCode, message) {
  if (typeof value !== 'string') throw serviceError(errorCode, message);
  if (value.length > maximum) throw serviceError(errorCode, message);
  return value;
}

function normalizedPromptResponses(content, responses) {
  if (!Array.isArray(responses) || responses.length > content.prompts.length) {
    throw serviceError(DEVOTIONAL_ERROR_CODES.INVALID_RESPONSE, 'Your responses could not be saved.');
  }
  const expected = new Set(content.prompts.map(prompt => prompt.id));
  const seen = new Set();
  const normalized = [];
  for (const item of responses) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.promptId !== 'string'
      || !expected.has(item.promptId) || seen.has(item.promptId)) {
      throw serviceError(DEVOTIONAL_ERROR_CODES.INVALID_RESPONSE, 'Your responses could not be saved.');
    }
    seen.add(item.promptId);
    const response = requiredText(
      item.response,
      DEVOTIONAL_RESPONSE_MAX_CHARS,
      DEVOTIONAL_ERROR_CODES.INVALID_RESPONSE,
      'Your responses could not be saved.'
    );
    if (response !== '') normalized.push({promptId:item.promptId, response});
  }
  return normalized;
}

function normalizeDraft(state, draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw serviceError(DEVOTIONAL_ERROR_CODES.INVALID_DRAFT, 'This devotional draft is invalid.');
  }
  const content = contentFor(draft.devotionalId);
  assertExpectedRevision(state, draft.expectedRevision);
  const promptResponses = normalizedPromptResponses(content, draft.promptResponses);
  const privateNotes = requiredText(
    draft.privateNotes,
    DEVOTIONAL_PRIVATE_NOTES_MAX_CHARS,
    DEVOTIONAL_ERROR_CODES.INVALID_PRIVATE_NOTES,
    'Your private notes could not be saved.'
  );
  return {content, promptResponses, privateNotes};
}

function nextEntryId(options, d) {
  const create = options?.idFactory || (() => crypto.randomUUID());
  const id = typeof create === 'function' ? String(create('devotional-entry') || '').trim() : '';
  if (!id || d.devotionalState.entries.some(entry => entry.id === id)) {
    throw serviceError(DEVOTIONAL_ERROR_CODES.INVALID_OPERATION, 'A unique devotional entry could not be created.');
  }
  return id;
}

function ensureActive(d, devotionalId) {
  if (devotionalId !== d.devotionalState.activeDevotionalId) {
    throw serviceError(DEVOTIONAL_ERROR_CODES.ACTIVE_DEVOTIONAL_REQUIRED, 'Open the current devotional before making this change.');
  }
}

async function mutateAtomically(state, expectedRevision, persist, options, operation) {
  if (typeof persist !== 'function') {
    throw serviceError(DEVOTIONAL_ERROR_CODES.INVALID_OPERATION, 'A persistence callback is required.');
  }
  assertExpectedRevision(state, expectedRevision);
  assertDomainValid(state);
  const before = clone(state);
  try {
    const d = domain(state);
    const now = nowFrom(options);
    const result = operation({d, now});
    assertDomainValid(state);
    advanceStateRevision(state);
    try {
      await persist();
    } catch (error) {
      if (error?.code === 'VAULT_CONFLICT') throw error;
      throw serviceError(DEVOTIONAL_ERROR_CODES.PERSISTENCE_FAILED, 'The devotional change could not be saved.');
    }
    return typeof result === 'function' ? result() : clone(result);
  } catch (error) {
    restoreObject(state, before);
    if (error?.code === 'VAULT_CONFLICT') throw error;
    if (error instanceof DevotionalServiceError) throw error;
    throw serviceError(DEVOTIONAL_ERROR_CODES.DOMAIN_INVALID, 'The devotional change could not be completed.');
  }
}

export function devotionalLibrary() {
  return clone(FAITH_MONEY_DEVOTIONALS);
}

export function getActiveDevotional(state) {
  const d = domain(state);
  return clone(contentFor(d.devotionalState.activeDevotionalId));
}

export function getDevotionalEntry(state, devotionalId) {
  const d = domain(state);
  contentFor(devotionalId);
  return clone(entryFor(d, devotionalId));
}

export function getDevotionalHistory(state) {
  const d = domain(state);
  const progress = d.devotionalState;
  return FAITH_MONEY_DEVOTIONALS.map(content => {
    const entry = entryFor(d, content.id);
    return {
      devotional:clone(content),
      entry:clone(entry),
      isActive:content.id === progress.activeDevotionalId,
      isCompleted:progress.completedDevotionalIds.includes(content.id),
      isSaved:progress.savedDevotionalIds.includes(content.id)
    };
  });
}

export function createDevotionalDraft(state, devotionalId = devotionalState(state).activeDevotionalId) {
  const d = domain(state);
  const content = contentFor(devotionalId);
  const entry = entryFor(d, devotionalId);
  const responseByPromptId = new Map((entry?.promptResponses || []).map(item => [item.promptId, item.response]));
  return {
    expectedRevision:getStateRevision(state),
    devotionalId:content.id,
    promptResponses:content.prompts.map(prompt => ({promptId:prompt.id, response:responseByPromptId.get(prompt.id) || ''})),
    privateNotes:entry?.privateNotes || ''
  };
}

export function validateDevotionalDraft(state, draft) {
  try {
    normalizeDraft(state, draft);
    return {ok:true, errors:[]};
  } catch (error) {
    if (error instanceof DevotionalServiceError) return {ok:false, errors:[{code:error.code, message:error.message}]};
    return {ok:false, errors:[{code:DEVOTIONAL_ERROR_CODES.INVALID_DRAFT, message:'This devotional draft is invalid.'}]};
  }
}

export async function saveDevotionalResponses(state, draft, persist, options = {}) {
  const normalized = normalizeDraft(state, draft);
  return mutateAtomically(state, draft.expectedRevision, persist, options, ({d, now}) => {
    const progress = d.devotionalState;
    let entry = entryFor(d, normalized.content.id);
    if (!entry) {
      entry = {
        id:nextEntryId(options, d),
        devotionalId:normalized.content.id,
        promptResponses:[],
        privateNotes:'',
        startedAt:now,
        updatedAt:now,
        completedAt:null,
        contentVersion:DEVOTIONAL_CONTENT_VERSION
      };
      progress.entries.push(entry);
    }
    entry.promptResponses = normalized.promptResponses;
    entry.privateNotes = normalized.privateNotes;
    entry.updatedAt = now;
    progress.lastOpenedAt = now;
    return () => clone(entry);
  });
}

export async function savePrivateNotes(state, {expectedRevision, devotionalId, privateNotes} = {}, persist, options = {}) {
  const draft=createDevotionalDraft(state, devotionalId);
  draft.expectedRevision=expectedRevision;
  draft.privateNotes=privateNotes;
  return saveDevotionalResponses(state, draft, persist, options);
}

export async function toggleSavedDevotional(state, {expectedRevision, devotionalId, saved} = {}, persist, options = {}) {
  contentFor(devotionalId);
  return mutateAtomically(state, expectedRevision, persist, options, ({d, now}) => {
    const progress = d.devotionalState;
    const currentlySaved = progress.savedDevotionalIds.includes(devotionalId);
    const nextSaved = saved === undefined ? !currentlySaved : saved;
    if (typeof nextSaved !== 'boolean') {
      throw serviceError(DEVOTIONAL_ERROR_CODES.INVALID_OPERATION, 'This devotional save setting is invalid.');
    }
    progress.savedDevotionalIds = nextSaved
      ? [...new Set([...progress.savedDevotionalIds, devotionalId])]
      : progress.savedDevotionalIds.filter(id => id !== devotionalId);
    progress.lastOpenedAt = now;
    return {devotionalId, saved:nextSaved};
  });
}

export async function completeDevotional(state, {expectedRevision, devotionalId} = {}, persist, options = {}) {
  contentFor(devotionalId);
  return mutateAtomically(state, expectedRevision, persist, options, ({d, now}) => {
    ensureActive(d, devotionalId);
    const progress = d.devotionalState;
    let entry = entryFor(d, devotionalId);
    if (progress.completedDevotionalIds.includes(devotionalId) || entry?.completedAt) {
      throw serviceError(DEVOTIONAL_ERROR_CODES.DEVOTIONAL_ALREADY_COMPLETED, 'This devotional is already complete.');
    }
    if (!entry) {
      entry = {
        id:nextEntryId(options, d),
        devotionalId,
        promptResponses:[],
        privateNotes:'',
        startedAt:now,
        updatedAt:now,
        completedAt:null,
        contentVersion:DEVOTIONAL_CONTENT_VERSION
      };
      progress.entries.push(entry);
    }
    if (!entry.completedAt) entry.completedAt = now;
    entry.updatedAt = now;
    progress.completedDevotionalIds = [...new Set([...progress.completedDevotionalIds, devotionalId])];
    progress.lastOpenedAt = now;
    return () => clone(entry);
  });
}

export async function advanceToNextDevotional(state, {expectedRevision, devotionalId} = {}, persist, options = {}) {
  const content = contentFor(devotionalId);
  const d = domain(state);
  assertExpectedRevision(state, expectedRevision);
  assertDomainValid(state);
  ensureActive(d, devotionalId);
  if (!d.devotionalState.completedDevotionalIds.includes(devotionalId)) {
    throw serviceError(DEVOTIONAL_ERROR_CODES.ACTIVE_DEVOTIONAL_NOT_COMPLETE, 'Mark this devotional complete before continuing.');
  }
  const next = FAITH_MONEY_DEVOTIONALS.find(item => item.sequence === content.sequence + 1);
  if (!next) return {devotionalId, nextDevotionalId:null, hasNext:false};
  return mutateAtomically(state, expectedRevision, persist, options, ({d:nextDomain, now}) => {
    nextDomain.devotionalState.activeDevotionalId = next.id;
    nextDomain.devotionalState.rotationStartedAt = now;
    nextDomain.devotionalState.lastOpenedAt = now;
    return {devotionalId, nextDevotionalId:next.id, hasNext:true};
  });
}

export function reopenDevotional(state, devotionalId) {
  const content = contentFor(devotionalId);
  return {devotional:clone(content), entry:getDevotionalEntry(state, devotionalId)};
}
