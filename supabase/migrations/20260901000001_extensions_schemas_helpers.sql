-- Foundations: extensions, private schema, shared helpers.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists app_private;
comment on schema app_private is
  'Integration and ledger internals. Not exposed via the Supabase Data API.';

revoke all on schema app_private from public;
revoke all on schema app_private from anon, authenticated;
grant usage on schema app_private to postgres, service_role;

-- updated_at helper for mutable records
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

-- Prevent hard deletes of immutable financial rows
create or replace function public.forbid_hard_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Hard deletes are forbidden on financial table %.%',
    tg_table_schema, tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

revoke all on function public.forbid_hard_delete() from public;

-- Guard: posted ledger rows are immutable
create or replace function public.forbid_posted_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Posted ledger records cannot be updated or deleted'
    using errcode = 'restrict_violation';
end;
$$;

revoke all on function public.forbid_posted_ledger_mutation() from public;
