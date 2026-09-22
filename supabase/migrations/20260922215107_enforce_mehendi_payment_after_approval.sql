create or replace function public.enforce_mehendi_payment_after_approval()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.catalog_item_id is not null
     and new.payment_status in ('payment_requested', 'paid') then
    if new.status not in ('Confirmed', 'Completed') then
      raise exception using
        errcode = 'P0001',
        message = 'PAYMENT_BEFORE_APPROVAL';
    end if;

    if new.cancellation_acknowledged is not true then
      raise exception using
        errcode = 'P0001',
        message = 'PAYMENT_POLICY_NOT_ACCEPTED';
    end if;
  end if;

  if old.payment_status = 'paid'
     and new.payment_status = 'not_requested' then
    raise exception using
      errcode = 'P0001',
      message = 'PAID_PAYMENT_STATUS_CANNOT_BE_RESET';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_mehendi_payment_after_approval() from public, anon, authenticated;

drop trigger if exists enforce_mehendi_payment_after_approval_trigger
  on public.mehendi_bookings;

create trigger enforce_mehendi_payment_after_approval_trigger
before update of payment_status on public.mehendi_bookings
for each row
when (old.payment_status is distinct from new.payment_status)
execute function public.enforce_mehendi_payment_after_approval();
