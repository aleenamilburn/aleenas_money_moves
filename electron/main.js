import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {app, BrowserWindow, dialog, ipcMain, protocol, session, shell} from 'electron';
import {LocalVaultRepository} from './localVaultRepository.js';

const APP_PROTOCOL = 'money-moves';
const APP_HOST = 'app';
const EXTERNAL_HOSTS = new Set(['www.google.com']);
const isDevelopment = !app.isPackaged;
let mainWindow = null;
let vaultRepository = null;

protocol.registerSchemesAsPrivileged([{
  scheme:APP_PROTOCOL,
  privileges:{standard:true, secure:true, supportFetchAPI:true, corsEnabled:true}
}]);

function safeError(error) {
  const code = typeof error?.code === 'string' ? error.code : 'PERSISTENCE_FAILED';
  const messages = {
    VAULT_NOT_FOUND:'The encrypted vault was not found.',
    VAULT_ALREADY_EXISTS:'An encrypted vault already exists on this device.',
    VAULT_CONFLICT:'The encrypted vault changed before it could be saved.',
    VAULT_CORRUPT:'The encrypted vault could not be verified.',
    INVALID_VAULT_ENVELOPE:'The encrypted vault envelope is not valid.',
    INVALID_BACKUP:'The selected backup is not valid.',
    BACKUP_CANCELLED:'Backup export was cancelled.',
    RESTORE_CANCELLED:'Backup restore was cancelled.',
    FILE_PERMISSION_DENIED:'Money Moves does not have permission to access the encrypted vault.',
    FILE_WRITE_FAILED:'Money Moves could not save the encrypted vault.',
    FILE_READ_FAILED:'Money Moves could not read the encrypted vault.',
    FILE_TOO_LARGE:'The encrypted vault file is too large.',
    PERSISTENCE_FAILED:'Money Moves could not complete the encrypted vault operation.'
  };
  return {code:messages[code] ? code : 'PERSISTENCE_FAILED', message:messages[code] || messages.PERSISTENCE_FAILED};
}

function rendererIsTrusted(event) {
  try {
    const url = new URL(event.senderFrame?.url || '');
    return url.protocol === `${APP_PROTOCOL}:` && url.hostname === APP_HOST;
  } catch { return false; }
}

function requireTrustedRenderer(event) {
  if (!rendererIsTrusted(event)) throw Object.assign(new Error('Untrusted renderer.'), {code:'PERSISTENCE_FAILED'});
}

function requireEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.byteLength(JSON.stringify(value), 'utf8') > 16 * 1024 * 1024) {
    throw Object.assign(new Error('Invalid request.'), {code:'INVALID_VAULT_ENVELOPE'});
  }
  return value;
}

function requireGeneration(value) {
  if (typeof value !== 'string' || value.length > 80) throw Object.assign(new Error('Invalid request.'), {code:'INVALID_VAULT_ENVELOPE'});
  return value;
}

function registerIpc() {
  const invoke = (channel, handler) => ipcMain.handle(channel, async (event, ...args) => {
    try { requireTrustedRenderer(event); return await handler(event, ...args); }
    catch (error) { throw safeError(error); }
  });
  invoke('money-moves:vault:inspect', () => vaultRepository.inspect());
  invoke('money-moves:vault:read', () => vaultRepository.load());
  invoke('money-moves:vault:create', (_event, envelope) => vaultRepository.create(requireEnvelope(envelope)));
  invoke('money-moves:vault:save', (_event, envelope, expectedGeneration) => vaultRepository.save(requireEnvelope(envelope), {expectedVaultGeneration:requireGeneration(expectedGeneration)}));
  invoke('money-moves:vault:restore', (_event, envelope, expectedGeneration) => vaultRepository.restore(requireEnvelope(envelope), {expectedVaultGeneration:requireGeneration(expectedGeneration)}));
  invoke('money-moves:vault:export', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title:'Export encrypted Money Moves backup',
      defaultPath:`money-moves-backup-${new Date().toISOString().slice(0, 10)}.mmvault`,
      filters:[{name:'Money Moves encrypted backup', extensions:['mmvault']}],
      properties:['showOverwriteConfirmation', 'createDirectory']
    });
    if (result.canceled || !result.filePath) return {cancelled:true};
    await vaultRepository.exportTo(result.filePath);
    return {cancelled:false};
  });
  invoke('money-moves:vault:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title:'Choose a Money Moves encrypted backup',
      filters:[{name:'Money Moves encrypted backup', extensions:['mmvault']}],
      properties:['openFile']
    });
    if (result.canceled || result.filePaths.length !== 1) return {cancelled:true};
    return {cancelled:false, encryptedEnvelope:await vaultRepository.importFrom(result.filePaths[0])};
  });
  invoke('money-moves:app:version', () => app.getVersion());
  invoke('money-moves:app:platform', () => process.platform);
  invoke('money-moves:app:open-external', async (_event, value) => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !EXTERNAL_HOSTS.has(url.hostname) || url.username || url.password) {
      throw Object.assign(new Error('Blocked external link.'), {code:'PERSISTENCE_FAILED'});
    }
    await shell.openExternal(url.toString());
    return {opened:true};
  });
}

function installContentProtocol() {
  const contentTypes = {'.css':'text/css', '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.ico':'image/x-icon'};
  protocol.handle(APP_PROTOCOL, async request => {
    try {
      const requested = new URL(request.url);
      if (requested.hostname !== APP_HOST || requested.search || requested.hash) return new Response('Not found.', {status:404});
      const rawPath = requested.pathname === '/' ? '/index.html' : decodeURIComponent(requested.pathname);
      const relative = rawPath.replace(/^\/+/, '');
      if (!relative || relative.split('/').some(segment => segment === '..' || segment === '.')) return new Response('Not found.', {status:404});
      const root = app.getAppPath();
      const target = path.join(root, relative);
      const content = await fs.readFile(target);
      return new Response(content, {headers:{'content-type':contentTypes[path.extname(relative).toLowerCase()] || 'application/octet-stream'}});
    } catch { return new Response('Not found.', {status:404}); }
  });
}

function secureWindow(window) {
  window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== `${APP_PROTOCOL}://${APP_HOST}/index.html`) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width:1320,
    height:900,
    minWidth:1040,
    minHeight:700,
    show:false,
    title:'Money Moves',
    webPreferences:{
      // Electron loads sandboxed preloads through CommonJS even when the app's
      // package is ESM. Keep this bridge explicitly `.cjs` so the packaged
      // renderer always receives the constrained desktop API.
      preload:path.join(path.dirname(fileURLToPath(import.meta.url)), 'preload.cjs'),
      nodeIntegration:false,
      contextIsolation:true,
      sandbox:true,
      webSecurity:true,
      allowRunningInsecureContent:false,
      experimentalFeatures:false,
      webviewTag:false
    }
  });
  secureWindow(mainWindow);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  void mainWindow.loadURL(`${APP_PROTOCOL}://${APP_HOST}/index.html`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    app.setName('Money Moves');
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    vaultRepository = new LocalVaultRepository({baseDirectory:app.getPath('userData')});
    installContentProtocol();
    registerIpc();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

export const desktopSecurity = Object.freeze({
  appProtocol:APP_PROTOCOL,
  isDevelopment,
  externalHosts:[...EXTERNAL_HOSTS],
  webPreferences:Object.freeze({nodeIntegration:false, contextIsolation:true, sandbox:true, webSecurity:true, allowRunningInsecureContent:false, experimentalFeatures:false})
});
