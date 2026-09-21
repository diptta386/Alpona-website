alter table public.site_errors
  add column if not exists technical_details text,
  add column if not exists resolution_status text not null default 'open',
  add column if not exists diagnosis text,
  add column if not exists suggested_fix text,
  add column if not exists fix_result text,
  add column if not exists analyzed_at timestamptz,
  add column if not exists resolved_at timestamptz;

update public.site_errors
set resolution_status = case when resolved then 'resolved' else 'open' end
where resolution_status = 'open';

alter table public.site_errors
  drop constraint if exists site_errors_resolution_status_check,
  add constraint site_errors_resolution_status_check
    check (resolution_status in ('open','analyzing','action_required','recovered','resolved')),
  drop constraint if exists site_errors_technical_details_length_check,
  add constraint site_errors_technical_details_length_check
    check (technical_details is null or char_length(technical_details) <= 4000);
