# Money Moves

A local-first, encrypted personal finance dashboard for macOS, Windows, and Linux.

## Launch on a MacBook Pro

1. Double-click the ZIP to extract it.
2. Open the extracted Money Moves folder.
3. Double-click `start.command` if present, or open Terminal in the folder and run:

   ```bash
   python3 start.py
   ```

4. The app opens at `http://127.0.0.1:8080`.
5. Keep Terminal open while using the app. Press Control-C to stop it.

You can also run:

```bash
chmod +x start.sh
./start.sh
```

## First launch

Create a passphrase with at least 12 characters. It encrypts the local vault and is not recoverable.

This release preserves the V1 local dashboard while introducing a V2 foundation for schema migrations and domain validation. It does not contain bank credentials, access tokens, or a live bank connection.

## V2 foundation status

The repository now has a versioned state schema, runtime-validated foundation models, and a compatibility-preserving V1-to-V2 migration path. The existing V1 UI remains in place. Transaction import, new V2 screens, and Plaid are not part of this foundation release.

## Monthly rollover

At launch, the app checks the computer’s local month. A new month is selected automatically while bucket order, targets, rules, travel history, and preferences carry forward. The existing V1 UI retains its current local calculations.

The app cannot fetch transactions while closed. The V2 import workflow is intentionally out of scope for this foundation release.

## Security

- AES-256-GCM encrypted vault
- PBKDF2-SHA-256 with 600,000 iterations
- Fresh IV for every save
- 60-minute default inactivity lock
- Encrypted backup export and restore
- No analytics, external scripts, or remote fonts

See `SECURITY.md` for the threat model.

## Current V1 screens

- Overview
- Weekly review
- Buckets & rules
- Travel
- Debt & goals
- Settings & vault

## Important limitation

Direct bank API synchronization is not included. Implementing that safely requires a financial-data aggregator, secure token storage, pending/posted reconciliation, and connection-repair flows. Plaid is intentionally out of scope.
