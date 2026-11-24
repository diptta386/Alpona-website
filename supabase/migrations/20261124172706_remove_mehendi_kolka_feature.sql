begin;

delete from public.site_errors
where concat_ws(' ', message, page_url, technical_details, diagnosis, suggested_fix, fix_result)
  ilike any (array['%mehendi%', '%kolka%']);

delete from public.agent_tasks
where concat_ws(' ', direction, result_summary)
  ilike any (array['%mehendi%', '%kolka%']);

delete from public.owner_reports
where concat_ws(' ', metrics::text, summary)
  ilike any (array['%mehendi%', '%kolka%']);

delete from public.submission_rate_limits
where kind = 'mehendi';

drop table if exists public.mehendi_upload_sessions cascade;
drop table if exists public.mehendi_bookings cascade;
drop table if exists public.mehendi_catalog_items cascade;
drop table if exists public.mehendi_addons cascade;
drop table if exists public.mehendi_travel_zones cascade;
drop table if exists public.mehendi_artists cascade;

drop function if exists public.update_mehendi_booking_status(bigint, text);
drop function if exists public.create_secure_mehendi_booking(jsonb);
drop function if exists public.enforce_mehendi_payment_after_approval();

drop policy if exists "Owner can upload Mehendi catalog images" on storage.objects;
drop policy if exists "Owner can read Mehendi catalog image records" on storage.objects;
drop policy if exists "Owner can update Mehendi catalog images" on storage.objects;
drop policy if exists "Owner can delete Mehendi catalog images" on storage.objects;

commit;
