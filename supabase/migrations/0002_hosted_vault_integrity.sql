-- Hosted-vault integrity hardening.
--
-- The outer generation is operational metadata used by PostgREST's conditional
-- UPDATE. The browser now binds that generation and a monotonic vaultSequence into
-- AES-GCM additional authenticated data. These database checks prevent a browser
-- caller from separating the row generation from that protected envelope.

create or replace function public.assert_hosted_vault_envelope_progression()
returns trigger
language plpgsql
as $$
declare
  next_sequence bigint;
  previous_sequence bigint;
begin
  if jsonb_typeof(new.blob) <> 'object'
     or not (new.blob ? 'vaultGeneration')
     or new.blob->>'vaultGeneration' <> new.generation then
    raise exception 'vault generation must match the encrypted envelope';
  end if;

  begin
    next_sequence := (new.blob->>'vaultSequence')::bigint;
  exception when others then
    raise exception 'vault sequence must be a positive integer';
  end;

  if next_sequence is null or next_sequence < 1 then
    raise exception 'vault sequence must be a positive integer';
  end if;

  if tg_op = 'INSERT' then
    if next_sequence <> 1 then
      raise exception 'a new hosted vault must begin at sequence 1';
    end if;
    return new;
  end if;

  if old.blob ? 'vaultSequence' then
    begin
      previous_sequence := (old.blob->>'vaultSequence')::bigint;
    exception when others then
      raise exception 'existing vault sequence is invalid';
    end;
    if previous_sequence is null or previous_sequence < 1 or next_sequence <> previous_sequence + 1 then
      raise exception 'hosted vault sequence must advance exactly once';
    end if;
  elsif next_sequence <> 1 then
    -- Legacy hosted envelopes predate authenticated sequence metadata. Their
    -- first hardened replacement is explicitly allowed to establish sequence 1.
    raise exception 'legacy hosted vaults must establish sequence 1';
  end if;

  return new;
end;
$$;

drop trigger if exists vaults_enforce_envelope_integrity on public.vaults;
create trigger vaults_enforce_envelope_integrity
  before insert or update on public.vaults
  for each row
  execute function public.assert_hosted_vault_envelope_progression();

-- Existing candidate rows are allowed to migrate on their next successful
-- client-side unlock/save. The constraint is still enforced for every new or
-- updated row immediately; retain NOT VALID until the isolated project confirms
-- that all historical candidate rows have been rewritten.
alter table public.vaults
  add constraint vaults_generation_matches_envelope
  check (
    jsonb_typeof(blob) = 'object'
    and blob ? 'vaultGeneration'
    and blob->>'vaultGeneration' = generation
    and (
      not (blob ? 'vaultSequence')
      or (
        jsonb_typeof(blob->'vaultSequence') = 'number'
        and blob->>'vaultSequence' ~ '^[1-9][0-9]*$'
      )
    )
  ) not valid;

-- RLS remains the authorization authority, but explicit privileges ensure an
-- anonymous browser role cannot reach either table even if a future policy is
-- accidentally added without a separate privilege review.
revoke all on table public.vaults from anon;
grant select, insert, update on table public.vaults to authenticated;
revoke all on table public.plaid_secrets from anon, authenticated;
