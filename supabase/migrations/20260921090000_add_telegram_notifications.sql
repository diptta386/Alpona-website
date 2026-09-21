create table if not exists public.notification_settings (
  channel text primary key,
  destination_id bigint not null,
  destination_type text not null default 'private',
  bot_username text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_settings_channel_check check (channel in ('telegram')),
  constraint notification_settings_type_check check (destination_type in ('private'))
);

alter table public.notification_settings enable row level security;
revoke all on table public.notification_settings from anon, authenticated;

alter table public.orders
  add column if not exists telegram_notified_at timestamptz,
  add column if not exists telegram_notification_error text;

alter table public.mehendi_bookings
  add column if not exists telegram_notified_at timestamptz,
  add column if not exists telegram_notification_error text;

alter table public.orders
  drop constraint if exists orders_telegram_notification_error_length_check,
  add constraint orders_telegram_notification_error_length_check
    check (telegram_notification_error is null or char_length(telegram_notification_error) <= 500);

alter table public.mehendi_bookings
  drop constraint if exists mehendi_telegram_notification_error_length_check,
  add constraint mehendi_telegram_notification_error_length_check
    check (telegram_notification_error is null or char_length(telegram_notification_error) <= 500);
