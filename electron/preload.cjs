const {contextBridge, ipcRenderer} = require('electron');

const MAX_ENVELOPE_BYTES = 16 * 1024 * 1024;

function assertEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > MAX_ENVELOPE_BYTES) {
    throw new TypeError('Invalid encrypted vault request.');
  }
  return value;
}

function assertGeneration(value) {
  if (typeof value !== 'string' || value.length > 80) throw new TypeError('Invalid encrypted vault generation.');
  return value;
}

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

const desktopApi = Object.freeze({
  vault:Object.freeze({
    inspect:() => invoke('money-moves:vault:inspect'),
    read:() => invoke('money-moves:vault:read'),
    create:envelope => invoke('money-moves:vault:create', assertEnvelope(envelope)),
    save:(envelope, expectedGeneration) => invoke('money-moves:vault:save', assertEnvelope(envelope), assertGeneration(expectedGeneration)),
    exportBackup:() => invoke('money-moves:vault:export'),
    importBackup:() => invoke('money-moves:vault:import'),
    restoreBackup:(envelope, expectedGeneration) => invoke('money-moves:vault:restore', assertEnvelope(envelope), assertGeneration(expectedGeneration))
  }),
  app:Object.freeze({
    getVersion:() => invoke('money-moves:app:version'),
    getPlatform:() => invoke('money-moves:app:platform'),
    openExternal:url => {
      if (typeof url !== 'string' || url.length > 2048) throw new TypeError('Invalid external link.');
      return invoke('money-moves:app:open-external', url);
    }
  })
});

contextBridge.exposeInMainWorld('moneyMovesDesktop', desktopApi);
