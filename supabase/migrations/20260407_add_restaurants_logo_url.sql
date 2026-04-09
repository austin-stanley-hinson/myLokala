alter table public.restaurants
add column if not exists logo_url text;

insert into storage.buckets (id, name, public)
values ('restaurant-logos', 'restaurant-logos', true)
on conflict (id) do nothing;
