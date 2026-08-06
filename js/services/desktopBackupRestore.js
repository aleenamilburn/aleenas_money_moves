export const DESKTOP_BACKUP_RESTORE_OUTCOME = Object.freeze({
  IMPORT_CANCELLED:'import_cancelled',
  IMPORT_FAILED:'import_failed',
  PASSPHRASE_CANCELLED:'passphrase_cancelled',
  CONFIRMATION_CANCELLED:'confirmation_cancelled',
  RESTORE_FAILED:'restore_failed',
  RESTORED:'restored'
});

export const DESKTOP_BACKUP_RESTORE_MESSAGES = Object.freeze({
  [DESKTOP_BACKUP_RESTORE_OUTCOME.IMPORT_CANCELLED]:'Backup import canceled. Your current vault was not changed.',
  [DESKTOP_BACKUP_RESTORE_OUTCOME.IMPORT_FAILED]:'Could not open the selected encrypted backup. Your current vault was not changed.',
  [DESKTOP_BACKUP_RESTORE_OUTCOME.PASSPHRASE_CANCELLED]:'Restore canceled. Your current vault was not changed.',
  [DESKTOP_BACKUP_RESTORE_OUTCOME.CONFIRMATION_CANCELLED]:'Restore canceled. Your current vault was not changed.',
  [DESKTOP_BACKUP_RESTORE_OUTCOME.RESTORE_FAILED]:'The backup or passphrase could not be verified. Your current vault was not changed.'
});

function outcome(kind, details = {}) {
  return Object.freeze({kind, ...details});
}

// This coordinator is the renderer boundary for native backup selection. It must
// not surface the raw envelope, passphrase, native path, or underlying error in
// its outcomes because callers render those outcomes directly to the user.
export async function runDesktopBackupRestore({importEncryptedBackup, requestPassphrase, confirmRestore, restore} = {}) {
  let raw;
  try {
    raw = await importEncryptedBackup();
  } catch {
    return outcome(DESKTOP_BACKUP_RESTORE_OUTCOME.IMPORT_FAILED);
  }
  if (raw === null) return outcome(DESKTOP_BACKUP_RESTORE_OUTCOME.IMPORT_CANCELLED);
  if (typeof raw !== 'string' || !raw.trim()) return outcome(DESKTOP_BACKUP_RESTORE_OUTCOME.IMPORT_FAILED);

  let passphrase;
  try {
    passphrase = await requestPassphrase();
  } catch {
    return outcome(DESKTOP_BACKUP_RESTORE_OUTCOME.IMPORT_FAILED);
  }
  if (typeof passphrase !== 'string' || !passphrase) return outcome(DESKTOP_BACKUP_RESTORE_OUTCOME.PASSPHRASE_CANCELLED);

  let confirmed;
  try {
    confirmed = await confirmRestore();
  } catch {
    return outcome(DESKTOP_BACKUP_RESTORE_OUTCOME.IMPORT_FAILED);
  }
  if (!confirmed) return outcome(DESKTOP_BACKUP_RESTORE_OUTCOME.CONFIRMATION_CANCELLED);

  try {
    return outcome(DESKTOP_BACKUP_RESTORE_OUTCOME.RESTORED, {restored:await restore(raw, passphrase)});
  } catch (error) {
    return outcome(DESKTOP_BACKUP_RESTORE_OUTCOME.RESTORE_FAILED, {conflict:error?.code === 'VAULT_CONFLICT'});
  }
}
