import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DESKTOP_BACKUP_RESTORE_MESSAGES,
  DESKTOP_BACKUP_RESTORE_OUTCOME,
  runDesktopBackupRestore
} from '../js/services/desktopBackupRestore.js';

const copiedSyntheticBackup = '{"copied":"BACKUP STATE ALPHA"}';
const syntheticSecrets = ['PRIVATE JOURNAL TEXT', 'correct synthetic passphrase', 'ciphertext-value', '/private/tmp/copied-synthetic-alpha.mmvault'];

function noSensitiveDetails(message) {
  for (const value of syntheticSecrets) assert.equal(message.includes(value), false, `message must not reveal ${value}`);
}

test('cancelling native backup selection performs no mutation and does not ask for a passphrase', async () => {
  let activeVault = 'CURRENT STATE BETA';
  const result = await runDesktopBackupRestore({
    importEncryptedBackup:async () => null,
    requestPassphrase:async () => { throw new Error('must not prompt after cancellation'); },
    confirmRestore:async () => { throw new Error('must not confirm after cancellation'); },
    restore:async () => { activeVault = 'unexpected mutation'; }
  });

  assert.equal(result.kind, DESKTOP_BACKUP_RESTORE_OUTCOME.IMPORT_CANCELLED);
  assert.equal(activeVault, 'CURRENT STATE BETA');
  assert.equal(DESKTOP_BACKUP_RESTORE_MESSAGES[result.kind], 'Backup import canceled. Your current vault was not changed.');
});

test('a valid selected copied synthetic backup opens the passphrase prompt, reaches confirmation, and restores', async () => {
  const calls = [];
  let activeVault = 'CURRENT STATE BETA';
  const result = await runDesktopBackupRestore({
    importEncryptedBackup:async () => {
      calls.push('select');
      return copiedSyntheticBackup;
    },
    requestPassphrase:async () => {
      calls.push('passphrase');
      return 'correct synthetic passphrase';
    },
    confirmRestore:async () => {
      calls.push('confirm');
      return true;
    },
    restore:async raw => {
      calls.push('restore');
      // Model the atomic commit boundary: only the verified replacement becomes
      // active, and the result contains no user-facing raw backup details.
      activeVault = raw === copiedSyntheticBackup ? 'BACKUP STATE ALPHA' : 'unexpected mutation';
      return {state:{marker:activeVault}, vaultGeneration:'mmvg:synthetic'};
    }
  });

  assert.deepEqual(calls, ['select', 'passphrase', 'confirm', 'restore']);
  assert.equal(result.kind, DESKTOP_BACKUP_RESTORE_OUTCOME.RESTORED);
  assert.equal(activeVault, 'BACKUP STATE ALPHA');
});

test('a wrong passphrase leaves the active vault untouched and exposes only a bounded message', async () => {
  let activeVault = 'CURRENT STATE BETA';
  const result = await runDesktopBackupRestore({
    importEncryptedBackup:async () => copiedSyntheticBackup,
    requestPassphrase:async () => 'correct synthetic passphrase',
    confirmRestore:async () => true,
    restore:async () => {
      throw Object.assign(new Error(`PRIVATE JOURNAL TEXT correct synthetic passphrase ciphertext-value /private/tmp/copied-synthetic-alpha.mmvault`), {code:'INVALID_BACKUP'});
    }
  });

  assert.equal(result.kind, DESKTOP_BACKUP_RESTORE_OUTCOME.RESTORE_FAILED);
  assert.equal(activeVault, 'CURRENT STATE BETA');
  noSensitiveDetails(DESKTOP_BACKUP_RESTORE_MESSAGES[result.kind]);
});

test('malformed, unsupported, and unreadable selected backups all have a visible sanitized failure outcome', async () => {
  for (const code of ['INVALID_BACKUP', 'FILE_READ_FAILED', 'PERSISTENCE_FAILED']) {
    await test(code, async () => {
      const result = await runDesktopBackupRestore({
        importEncryptedBackup:async () => {
          throw Object.assign(new Error(`PRIVATE JOURNAL TEXT correct synthetic passphrase ciphertext-value /private/tmp/copied-synthetic-alpha.mmvault`), {code});
        },
        requestPassphrase:async () => { throw new Error('must not prompt after failed selection'); },
        confirmRestore:async () => { throw new Error('must not confirm after failed selection'); },
        restore:async () => { throw new Error('must not restore after failed selection'); }
      });
      assert.equal(result.kind, DESKTOP_BACKUP_RESTORE_OUTCOME.IMPORT_FAILED);
      noSensitiveDetails(DESKTOP_BACKUP_RESTORE_MESSAGES[result.kind]);
    });
  }
});

test('all native-selection and restore failures resolve to outcomes instead of unhandled promise rejections', async () => {
  const cases = [
    {importEncryptedBackup:async () => { throw new Error('IPC read failure'); }},
    {importEncryptedBackup:async () => undefined},
    {
      importEncryptedBackup:async () => copiedSyntheticBackup,
      requestPassphrase:async () => { throw new Error('prompt unavailable'); }
    },
    {
      importEncryptedBackup:async () => copiedSyntheticBackup,
      requestPassphrase:async () => 'correct synthetic passphrase',
      confirmRestore:async () => { throw new Error('confirmation unavailable'); }
    }
  ];
  for (const callbacks of cases) {
    await assert.doesNotReject(runDesktopBackupRestore({
      requestPassphrase:async () => 'correct synthetic passphrase',
      confirmRestore:async () => true,
      restore:async () => ({state:{}}),
      ...callbacks
    }));
  }
});
