-- Permanent per-business QR codes for Colin's gift-card / pay-at-business model.
--
-- Each business owner gets one active public_code that prints on a physical QR.
-- Customers later scan https://www.mylokala.com/pay/[public_code].
--
-- Schema-only: no UI, no public lookup route, no payment processing.
-- Public scan lookup must go through a controlled server path later — there is
-- intentionally no anon/public SELECT policy on this table.

create table if not exists public.business_qr_codes (
  id uuid primary key default gen_random_uuid(),
  business_owner_id uuid not null references public.profiles(id) on delete cascade,
  public_code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- public_code must be unique and non-blank (after trim).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'business_qr_codes_public_code_key'
      and conrelid = 'public.business_qr_codes'::regclass
  ) then
    alter table public.business_qr_codes
      add constraint business_qr_codes_public_code_key unique (public_code);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'business_qr_codes_public_code_not_blank'
      and conrelid = 'public.business_qr_codes'::regclass
  ) then
    alter table public.business_qr_codes
      add constraint business_qr_codes_public_code_not_blank
      check (length(trim(public_code)) > 0);
  end if;
end
$$;

-- One active QR code per business owner. Inactive/historical rows may remain.
create unique index if not exists business_qr_codes_one_active_per_owner
  on public.business_qr_codes (business_owner_id)
  where is_active = true;

-- Keep updated_at current on every change (same pattern as business_payment_accounts).
create or replace function public.set_business_qr_codes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_business_qr_codes_updated_at
  on public.business_qr_codes;
create trigger set_business_qr_codes_updated_at
  before update on public.business_qr_codes
  for each row
  execute function public.set_business_qr_codes_updated_at();

alter table public.business_qr_codes enable row level security;

-- Owners who are business_owner profiles may manage only their own rows.
-- No anon/public SELECT — public pay-page lookup is a later server-controlled path.

drop policy if exists "Business owners can view own QR codes"
  on public.business_qr_codes;
create policy "Business owners can view own QR codes"
on public.business_qr_codes
for select
to authenticated
using (
  auth.uid() = business_owner_id
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_type = 'business_owner'
  )
);

drop policy if exists "Business owners can insert own QR codes"
  on public.business_qr_codes;
create policy "Business owners can insert own QR codes"
on public.business_qr_codes
for insert
to authenticated
with check (
  auth.uid() = business_owner_id
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_type = 'business_owner'
  )
);

drop policy if exists "Business owners can update own QR codes"
  on public.business_qr_codes;
create policy "Business owners can update own QR codes"
on public.business_qr_codes
for update
to authenticated
using (
  auth.uid() = business_owner_id
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_type = 'business_owner'
  )
)
with check (
  auth.uid() = business_owner_id
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_type = 'business_owner'
  )
);
