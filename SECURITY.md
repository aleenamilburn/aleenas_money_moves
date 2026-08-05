# Money Moves security model

Money Moves encrypts the authoritative local vault with AES-256-GCM. A key is derived in the Electron renderer from the passphrase using PBKDF2-SHA-256 with 600,000 iterations. The passphrase and derived key are not persisted. The main process receives only encrypted envelopes and cannot decrypt financial state.

## It helps protect against

- Someone inspecting a copied local vault while it is locked
- Someone obtaining an encrypted backup file
- Casual access to encrypted vault files in a shared Mac account
- Partial-write corruption: encrypted writes are flushed, read back, preserved as `previous.mmvault`, and atomically promoted

## It does not protect against

- Malware or a hostile process while the vault is unlocked
- Someone using the app during an unlocked session
- A compromised operating system
- A weak or reused passphrase
- Screen capture or shoulder surfing

Use a unique passphrase and keep the Mac login protected. Losing the passphrase makes the vault and encrypted backups unrecoverable. The app intentionally has no passphrase recovery.

The packaged renderer uses `nodeIntegration: false`, context isolation, renderer sandboxing, a restrictive CSP, a custom local protocol, navigation/new-window blocking, explicit external HTTPS allowlisting, and a small immutable IPC surface. Electron fuses disable RunAsNode, NODE_OPTIONS, NODE inspect arguments, extra file-protocol privileges, and loading app code outside the ASAR; ASAR integrity validation and cookie encryption are enabled.

The application uses no analytics, remote fonts, remote financial persistence, or bank credentials. The production bootstrap is an empty migration-valid state, not a financial seed snapshot. Hosted Supabase research remains historical and deferred; it is not loaded by the Electron runtime.
