export const DESKTOP_STARTUP_TIMEOUT_MS = 8000;

export class DesktopStartupError extends Error {
  constructor(code = 'STARTUP_FAILED') {
    super('Money Moves could not finish starting the encrypted local vault.');
    this.name = 'DesktopStartupError';
    this.code = code;
  }
}

export function desktopStartupFailure({isDesktopProtocol, hasDesktopBridge}) {
  if (isDesktopProtocol && !hasDesktopBridge) return new DesktopStartupError('DESKTOP_BRIDGE_UNAVAILABLE');
  return null;
}

export function desktopVaultScreen(hasVault) {
  return hasVault ? 'unlock' : 'setup';
}

export async function inspectDesktopVault(operation, {timeoutMs = DESKTOP_STARTUP_TIMEOUT_MS} = {}) {
  let timeoutId = null;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new DesktopStartupError('STARTUP_TIMEOUT')), timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(operation), timeout]);
  } catch (error) {
    if (error instanceof DesktopStartupError) throw error;
    throw error;
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}
