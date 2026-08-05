import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DESKTOP_STARTUP_TIMEOUT_MS, DesktopStartupError, desktopStartupFailure,
  desktopVaultScreen, inspectDesktopVault
} from '../js/services/desktopStartup.js';

test('clean and existing desktop vault inspections choose the Create Vault and Unlock Vault screens', async () => {
  assert.equal(DESKTOP_STARTUP_TIMEOUT_MS, 8000);
  assert.equal(desktopVaultScreen(await inspectDesktopVault(async () => false)), 'setup');
  assert.equal(desktopVaultScreen(await inspectDesktopVault(async () => true)), 'unlock');
});

test('a missing desktop preload bridge has a controlled startup failure', () => {
  assert.equal(desktopStartupFailure({isDesktopProtocol:false, hasDesktopBridge:false}), null);
  const failure = desktopStartupFailure({isDesktopProtocol:true, hasDesktopBridge:false});
  assert.ok(failure instanceof DesktopStartupError);
  assert.equal(failure.code, 'DESKTOP_BRIDGE_UNAVAILABLE');
});

test('a stalled desktop vault inspection rejects with a bounded, privacy-safe startup error', async () => {
  await assert.rejects(
    inspectDesktopVault(() => new Promise(() => {}), {timeoutMs:5}),
    error => error instanceof DesktopStartupError && error.code === 'STARTUP_TIMEOUT'
  );
});

test('a repository inspection error reaches the caller unchanged for controlled recovery routing', async () => {
  const failure = Object.assign(new Error('synthetic repository failure'), {code:'VAULT_CORRUPT'});
  await assert.rejects(inspectDesktopVault(() => { throw failure; }), error => error === failure);
});
