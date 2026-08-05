# Hosted Storage Setup

This phase moves the encrypted vault's storage address from `localStorage` to a
Postgres row hosted by Supabase, served via Vercel. The encryption boundary in
`js/vault.js` did not change — see the implementation report for what did.

Everything in this document requires creating accounts, entering credentials, or
configuring third-party consoles. None of it can be done by an AI coding agent —
it requires a human with the authority to create these accounts and approve their
terms. Follow the steps in order; later steps depend on values produced earlier.

## 1. Create the Supabase project

1. At [supabase.com](https://supabase.com), create a new project. Note the project's
   region — pick one close to where most users are, since every save round-trips to it.
2. In **Project Settings → API**, copy the **Project URL** and the **anon public**
   key. These are not secrets in the way a password is — the anon key is meant to
   ship in client code, and Row-Level Security (applied in step 3) is what actually
   restricts access. Do not copy the **service_role** key anywhere in this app; it
   bypasses Row-Level Security entirely and must never reach the browser.
3. Copy `js/config.example.js` to `js/config.js` (already gitignored) and fill in
   the two values from step 2:
   ```js
   window.MONEY_MOVES_SUPABASE_CONFIG = {
     url: 'https://<your-project-ref>.supabase.co',
     anonKey: '<your-anon-public-key>'
   };
   ```

## 2. Apply the schema

Apply both migrations in order: `supabase/migrations/0001_hosted_vault.sql`, then
`supabase/migrations/0002_hosted_vault_integrity.sql`. Use the Supabase SQL editor
or a CLI migration workflow linked to this *isolated test project*.

The first migration creates `vaults` (one row per user, RLS-restricted to
`auth.uid() = user_id`) and an empty, RLS-locked `plaid_secrets` placeholder. The
second migration binds the row generation to the encrypted envelope, requires a
monotonic hosted sequence on new writes, explicitly denies `anon` access, and
removes browser-role privileges from `plaid_secrets`.

Before relying on the project, confirm in the dashboard or SQL editor that:

- RLS is enabled on both tables.
- `vaults` has select/insert/update policies only for `auth.uid() = user_id`.
- `vaults_enforce_envelope_integrity` exists as a `BEFORE INSERT OR UPDATE` trigger.
- `authenticated` has select/insert/update privileges on `vaults`, but no delete
  privilege; `anon` has no vault privileges.
- `plaid_secrets` has no browser policy and no `anon` or `authenticated` privilege.

## 3. Set up Google sign-in

Google requires its own project separate from Supabase's.

1. In the [Google Cloud Console](https://console.cloud.google.com), create a project
   (or use an existing one), then go to **APIs & Services → OAuth consent screen**
   and configure it (user type, app name, support email). Google will require this
   before it issues credentials.
2. Under **APIs & Services → Credentials**, create an **OAuth client ID** of type
   **Web application**.
3. In the Supabase dashboard, under **Authentication → Providers → Google**, enable
   Google and copy the **redirect URL** Supabase shows there — it looks like
   `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Back in Google Cloud Console, add that exact URL to the OAuth client's
   **Authorized redirect URIs**, and add your app's real origin(s) (e.g.
   `https://your-app.vercel.app` and, for local development, `http://localhost:8080`)
   to **Authorized JavaScript origins**.
5. Copy the OAuth client's **Client ID** and **Client secret** into the same
   Supabase **Google** provider settings screen from step 3, and save.

At this point "Sign in with Google" should complete an OAuth round trip and return
an authenticated session — but the vault itself only exists once step 2's schema is
applied and a user has created one from the app's own "Create your encrypted money
vault" screen.

### Apple sign-in (not part of this phase)

`js/services/authService.js` structures providers as a small config map
(`AUTH_PROVIDERS`) specifically so Apple can be added later without touching
anything else — add `apple: 'apple'` to that map, add the corresponding Supabase
Auth provider configuration (an Apple Developer account and its own credential
setup, similarly external to this codebase), and add a second sign-in button next
to the Google one in `index.html`. Apple's requirement that "Sign in with Apple" be
offered wherever "Sign in with Google" is offered on iOS applies once a native iOS
app ships, not before — there is no deadline for this while the app is web-only.

## 4. Deploy to Vercel

This phase does not add custom server code — the atomic conditional write is a
direct, RLS-enforced call from the browser to Supabase's REST API. Vercel's role is
to serve static files. Point a Vercel project at this repository with no build
command and the repository root as the output directory. Supply a deployment-
specific, untracked `js/config.js` with the HTTPS **project base URL** (not
`/rest/v1`) and the public anon/publishable key.

Never place a service-role key in that file, in a browser-exposed Vercel
environment variable, or in Git history. The runtime rejects a non-base URL,
insecure production URL, or obvious service-role key shape.

For the integrity migration, apply the Supabase migration first and deploy the
hardened static application immediately after. Older open clients that do not send
the authenticated sequence will fail safely until reloaded; do not leave a mixed
version fleet in place.

## 5. Verify

1. Load the deployed (or local) app with no session — you should see "Sign in with
   Google," not the vault screens.
2. Sign in — you should land on "Create your encrypted money vault" the first time.
3. Create a vault, add data, reload the page — you should land on the passphrase
   unlock screen, still signed in.
4. In the Supabase dashboard's Table Editor, open `vaults` — there should be exactly
   one row, and its `blob.cipher.ciphertext` value should be opaque. Envelope
   metadata such as timestamps, KDF settings, generation, and sequence is expected;
   transaction/account/bucket/reimbursement plaintext is not.
5. Use two synthetic Google/Supabase users—not production financial data—to perform
   the cross-user RLS, forged-owner, stale-write, backup/restore, and session tests
   listed in `V2A_HOSTED_STORAGE_ACCEPTANCE.md` before treating hosted storage as
   accepted.
