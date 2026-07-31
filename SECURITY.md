# Money Moves security model

Money Moves encrypts the browser-stored vault with AES-256-GCM. A key is derived from the passphrase using PBKDF2-SHA-256 with 600,000 iterations. The passphrase and derived key are not persisted.

## It helps protect against

- Someone inspecting copied browser storage while the vault is locked
- Someone obtaining an encrypted backup file
- Casual access to financial data in a shared browser profile
- Offline inspection of the local storage files

## It does not protect against

- Malware or a hostile browser extension while the vault is unlocked
- Someone using the app during an unlocked session
- A compromised operating system
- A weak or reused passphrase
- Screen capture or shoulder surfing

Use a unique passphrase and keep the Mac login protected. Losing the passphrase makes the vault and encrypted backups unrecoverable.

The application uses no third-party JavaScript, analytics, remote fonts, or bank credentials. Current financial values in this build are a static seed snapshot, not a live bank connection.
