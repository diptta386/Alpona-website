create table if not exists public.site_settings (
  id text primary key,
  logo_url text not null default 'assets/logo.jpeg',
  logo_path text,
  hero_image_url text not null default 'assets/decor.jpeg',
  hero_image_path text,
  collection_image_1_url text not null default 'assets/decor.jpeg',
  collection_image_1_path text,
  collection_image_2_url text not null default 'assets/bag.jpeg',
  collection_image_2_path text,
  collection_image_3_url text not null default 'assets/clothing.jpeg',
  collection_image_3_path text,
  updated_at timestamptz not null default now(),
  constraint site_settings_homepage_only check (id = 'homepage'),
  constraint site_settings_url_lengths check (
    char_length(logo_url) <= 1000 and
    char_length(hero_image_url) <= 1000 and
    char_length(collection_image_1_url) <= 1000 and
    char_length(collection_image_2_url) <= 1000 and
    char_length(collection_image_3_url) <= 1000
  )
);

alter table public.site_settings enable row level security;

revoke all on table public.site_settings from anon, authenticated;
grant select on table public.site_settings to anon, authenticated;
grant insert, update on table public.site_settings to authenticated;

drop policy if exists "Public can read site settings" on public.site_settings;
create policy "Public can read site settings"
on public.site_settings
for select
to anon, authenticated
using (true);

drop policy if exists "Owner can insert site settings" on public.site_settings;
create policy "Owner can insert site settings"
on public.site_settings
for insert
to authenticated
with check (
  (select auth.uid()) = '5beecdb3-5e80-4a35-9133-5fc01ab7a772'::uuid
  and (select auth.jwt()->>'aal') = 'aal2'
);

drop policy if exists "Owner can update site settings" on public.site_settings;
create policy "Owner can update site settings"
on public.site_settings
for update
to authenticated
using (
  (select auth.uid()) = '5beecdb3-5e80-4a35-9133-5fc01ab7a772'::uuid
  and (select auth.jwt()->>'aal') = 'aal2'
)
with check (
  (select auth.uid()) = '5beecdb3-5e80-4a35-9133-5fc01ab7a772'::uuid
  and (select auth.jwt()->>'aal') = 'aal2'
);

insert into public.site_settings (id)
values ('homepage')
on conflict (id) do nothing;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'site-assets',
  'site-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owner can upload site assets" on storage.objects;
create policy "Owner can upload site assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'site-assets'
  and (storage.foldername(name))[1] = 'homepage'
  and (select auth.uid()) = '5beecdb3-5e80-4a35-9133-5fc01ab7a772'::uuid
  and (select auth.jwt()->>'aal') = 'aal2'
);

drop policy if exists "Owner can read site asset records" on storage.objects;
create policy "Owner can read site asset records"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'site-assets'
  and (storage.foldername(name))[1] = 'homepage'
  and (select auth.uid()) = '5beecdb3-5e80-4a35-9133-5fc01ab7a772'::uuid
  and (select auth.jwt()->>'aal') = 'aal2'
);

drop policy if exists "Owner can update site assets" on storage.objects;
create policy "Owner can update site assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'site-assets'
  and (storage.foldername(name))[1] = 'homepage'
  and (select auth.uid()) = '5beecdb3-5e80-4a35-9133-5fc01ab7a772'::uuid
  and (select auth.jwt()->>'aal') = 'aal2'
)
with check (
  bucket_id = 'site-assets'
  and (storage.foldername(name))[1] = 'homepage'
  and (select auth.uid()) = '5beecdb3-5e80-4a35-9133-5fc01ab7a772'::uuid
  and (select auth.jwt()->>'aal') = 'aal2'
);

drop policy if exists "Owner can delete site assets" on storage.objects;
create policy "Owner can delete site assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'site-assets'
  and (storage.foldername(name))[1] = 'homepage'
  and (select auth.uid()) = '5beecdb3-5e80-4a35-9133-5fc01ab7a772'::uuid
  and (select auth.jwt()->>'aal') = 'aal2'
);
