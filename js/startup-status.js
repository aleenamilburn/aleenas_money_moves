const FALLBACK_TIMEOUT_MS = 9000;
const GENERIC_FAILURE = 'Money Moves could not finish starting. Your encrypted vault was not changed. Quit and reopen the app. If this continues, reinstall this build before attempting vault recovery.';

let timer = null;
let startupResolved = false;

function panel(id) {
  return document.getElementById(id);
}

function showFallback(message = GENERIC_FAILURE, {force = false} = {}) {
  if (startupResolved && !force) return;
  if (timer !== null) clearTimeout(timer);
  const detail = panel('startupFailureMessage');
  if (detail) detail.textContent = message;
  for (const id of ['startupPanel', 'notConfiguredPanel', 'signinPanel', 'setupPanel', 'unlockPanel']) {
    panel(id)?.classList.toggle('hidden', id !== 'startupFailurePanel');
  }
  panel('lockLayer')?.classList.add('show');
  panel('appShell')?.setAttribute('aria-hidden', 'true');
}

function startupReady() {
  startupResolved = true;
  if (timer !== null) clearTimeout(timer);
}

globalThis.moneyMovesStartup = Object.freeze({ready:startupReady, fail:message => showFallback(message, {force:true})});

window.addEventListener('error', event => {
  if (event.target?.tagName === 'SCRIPT' || event.error) showFallback();
}, true);
window.addEventListener('unhandledrejection', () => showFallback());
timer = setTimeout(() => showFallback('Money Moves is taking too long to inspect the encrypted local vault. Your vault was not changed. Quit and reopen the app. If this continues, use a known encrypted backup only after obtaining support.'), FALLBACK_TIMEOUT_MS);
