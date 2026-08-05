import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const read = file => fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('Electron main, preload, Forge, and packaged HTML enforce the desktop security baseline', async () => {
  const [main, preload, forge, html, adapter] = await Promise.all([
    read('electron/main.js'), read('electron/preload.cjs'), read('forge.config.js'), read('index.html'), read('js/services/desktopVaultRepository.js')
  ]);
  for (const setting of ['nodeIntegration:false', 'contextIsolation:true', 'sandbox:true', 'webSecurity:true', 'allowRunningInsecureContent:false', 'experimentalFeatures:false']) assert.match(main, new RegExp(setting));
  assert.match(main, /protocol\.handle\(APP_PROTOCOL/);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{action:'deny'\}\)\)/);
  assert.match(main, /will-navigate/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /requestSingleInstanceLock/);
  assert.match(main, /requireTrustedRenderer/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\('moneyMovesDesktop'/);
  assert.doesNotMatch(preload, /invoke:\s*\(/);
  assert.doesNotMatch(preload, /exposeInMainWorld\([^\n]*ipcRenderer/);
  assert.match(forge, /RunAsNode\]:false/);
  assert.match(forge, /OnlyLoadAppFromAsar\]:true/);
  assert.match(forge, /EnableEmbeddedAsarIntegrityValidation\]:true/);
  assert.match(forge, /maker-dmg/);
  assert.doesNotMatch(html, /unsafe-inline|https:\/\/\*\.supabase\.co/);
  assert.match(html, /connect-src 'self'/);
  assert.doesNotMatch(adapter, /hostedVaultStorage|supabase/i);
});
