-- Money Moves hosted storage migration.
--
-- This creates exactly the two tables described in the hosted-storage phase spec:
-- one opaque-blob row per user for the encrypted vault, and an empty, RLS-locked
-- placeholder for future Plaid tokens. Neither table is ever queried or parsed for
-- its contents by anything server-side in this phase -- vaults.blob is ciphertext
-- from the client's point of view, and plaid_secrets has no columns yet beyond the
-- ones needed to reserve its RLS shape.
--
-- Run via the Supabase SQL editor or `supabase db push`. See
-- docs/engineering/HOSTED_STORAGE_SETUP.md for the surrounding project setup.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- vaults: one row per user, no history. generation is duplicated out of the
-- blob so the atomic conditional write (UPDATE ... WHERE generation = $expected)
-- never has to parse ciphertext to enforce concurrency.
-- ---------------------------------------------------------------------------

create table if not exists public.vaults (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  generation text not null,
  blob       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vaults enable row level security;

-- A signed-in user may read and write only their own row. There is deliberately
-- no delete policy: deleting a hosted vault is a separate, more consequential
-- action this phase does not implement (see js/app.js's resetVault handler,
-- which now only signs out of the browser rather than claiming to erase data).
create policy "vaults_select_own" on public.vaults
  for select using (auth.uid() = user_id);

create policy "vaults_insert_own" on public.vaults
  for insert with check (auth.uid() = user_id);

create policy "vaults_update_own" on public.vaults
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vaults_set_updated_at on public.vaults;
create trigger vaults_set_updated_at
  before update on public.vaults
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- plaid_secrets: empty and unused in this phase. Structurally separate from
-- vaults (no foreign key between them) so a future Plaid phase never needs to
-- touch vault-write code to add token handling.
--
-- Unlike vaults, this table grants NO policy to the authenticated/anon roles at
-- all -- RLS is enabled with zero client-reachable policies, so it is default-
-- deny from the browser in every case. Plaid access tokens must never reach
-- client code; only a future trusted server process using the service-role key
-- (which bypasses RLS by design) should ever read or write this table. Do not
-- add a client-facing policy here without a separately approved security design,
-- per the product's Plaid-readiness requirements.
-- ---------------------------------------------------------------------------

create table if not exists public.plaid_secrets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- Remaining columns (encrypted token material, item id, cursor state, etc.)
  -- are defined when the Plaid phase begins. Do not populate this table now.
);

alter table public.plaid_secrets enable row level security;

drop trigger if exists plaid_secrets_set_updated_at on public.plaid_secrets;
create trigger plaid_secrets_set_updated_at
  before update on public.plaid_secrets
  for each row
  execute function public.set_updated_at();
