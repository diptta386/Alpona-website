alter table public.mehendi_bookings
  add column if not exists client_request_id uuid;

create unique index if not exists mehendi_bookings_client_request_id_key
  on public.mehendi_bookings (client_request_id)
  where client_request_id is not null;

create or replace function public.create_secure_mehendi_booking(p_booking jsonb)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_id bigint;
  v_existing_id bigint;
  v_existing_booking_number text;
  v_paths text[];
  v_event_date date := (p_booking->>'event_date')::date;
  v_preferred_time text := p_booking->>'preferred_time';
  v_client_request_id uuid := nullif(p_booking->>'client_request_id', '')::uuid;
  v_slot_key text;
begin
  if v_event_date < current_date then
    raise exception using errcode = 'P0001', message = 'EVENT_DATE_IN_PAST';
  end if;

  if v_preferred_time not in ('Morning', 'Afternoon', 'Evening', 'Night') then
    raise exception using errcode = 'P0001', message = 'INVALID_TIME_SLOT';
  end if;

  if v_client_request_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('mehendi-request|' || v_client_request_id::text, 0)
    );

    select id, booking_number
    into v_existing_id, v_existing_booking_number
    from public.mehendi_bookings
    where client_request_id = v_client_request_id
    limit 1;

    if v_existing_id is not null then
      return jsonb_build_object(
        'id', v_existing_id,
        'booking_number', v_existing_booking_number,
        'reused', true
      );
    end if;
  end if;

  v_slot_key := v_event_date::text || '|' || v_preferred_time;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_slot_key, 0)
  );

  if exists (
    select 1
    from public.mehendi_bookings
    where event_date = v_event_date
      and preferred_time = v_preferred_time
      and status in ('Confirmed', 'Completed')
  ) then
    raise exception using errcode = 'P0001', message = 'SLOT_ALREADY_BOOKED';
  end if;

  select coalesce(array_agg(value), '{}'::text[])
  into v_paths
  from jsonb_array_elements_text(
    coalesce(p_booking->'custom_design_paths', '[]'::jsonb)
  );

  insert into public.mehendi_bookings(
    booking_number, client_request_id, customer_name, phone, customer_email,
    event_date, preferred_time, occasion, service_type, number_of_people,
    venue_area, address, notes, mehendi_coverage, mehendi_side, mehendi_hands,
    kolka_placement, kolka_side, custom_design_paths, status
  )
  values(
    p_booking->>'booking_number', v_client_request_id,
    p_booking->>'customer_name', p_booking->>'phone',
    nullif(p_booking->>'customer_email',''), v_event_date, v_preferred_time,
    p_booking->>'occasion', p_booking->>'service_type',
    (p_booking->>'number_of_people')::integer, p_booking->>'venue_area',
    p_booking->>'address', nullif(p_booking->>'notes',''),
    nullif(p_booking->>'mehendi_coverage',''),
    nullif(p_booking->>'mehendi_side',''),
    nullif(p_booking->>'mehendi_hands',''),
    nullif(p_booking->>'kolka_placement',''),
    nullif(p_booking->>'kolka_side',''), v_paths, 'Request Received'
  )
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'booking_number', p_booking->>'booking_number',
    'reused', false
  );
end;
$function$;
