export class StateRevisionError extends Error {
  constructor(message, code = 'INVALID_STATE_REVISION') {
    super(message);
    this.name = 'StateRevisionError';
    this.code = code;
  }
}

export function initializeStateRevision(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new StateRevisionError('State must be an object.');
  }
  if (state.stateRevision === undefined) state.stateRevision = 0;
  if (!Number.isSafeInteger(state.stateRevision) || state.stateRevision < 0) {
    throw new StateRevisionError('stateRevision must be a non-negative safe integer.');
  }
  return state.stateRevision;
}

export function getStateRevision(state) {
  return initializeStateRevision(state);
}

export function advanceStateRevision(state) {
  const current = initializeStateRevision(state);
  if (current === Number.MAX_SAFE_INTEGER) {
    throw new StateRevisionError('stateRevision cannot advance beyond the safe integer limit.');
  }
  state.stateRevision = current + 1;
  return state.stateRevision;
}
