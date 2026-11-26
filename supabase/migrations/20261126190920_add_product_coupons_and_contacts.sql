begin;
alter table public.site_settings add column messenger_url text not null default '';
alter table public.site_settings add constraint site_messenger_url_check check (messenger_url = '' or messenger_url ~ '^https://m\.me/[A-Za-z0-9.]+$');
create table public.coupons (
  code text primary key check (code ~ '^[A-Z0-9_-]{3,30}$'),
  discount_type text not null check (discount_type in ('fixed','percent')),
  amount numeric(12,2) not null check (amount > 0 and amount <= 1000000),
  min_order numeric(12,2) not null default 0 check (min_order >= 0),
  max_discount numeric(12,2) check (max_discount > 0),
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean not null default false,
  check (discount_type <> 'percent' or amount <= 100),
  check (starts_at is null or expires_at is null or expires_at > starts_at)
);
alter table public.coupons enable row level security;
grant select on public.coupons to anon, authenticated;
grant insert, update on public.coupons to authenticated;
grant all on public.coupons to service_role;
create policy "Public active coupons" on public.coupons for select to anon,authenticated
using (active and (starts_at is null or starts_at <= now()) and (expires_at is null or expires_at > now()));
create policy "Owner manages coupons" on public.coupons for all to authenticated
using ((select auth.uid())='5beecdb3-5e80-4a35-9133-5fc01ab7a772'::uuid and (select auth.jwt())->>'aal'='aal2')
with check ((select auth.uid())='5beecdb3-5e80-4a35-9133-5fc01ab7a772'::uuid and (select auth.jwt())->>'aal'='aal2');

alter table public.orders add column coupon_code text;
alter table public.orders add column discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0 and discount_amount <= subtotal);

create function public.quote_coupon(p_code text, p_subtotal numeric) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare c public.coupons%rowtype; d numeric;
begin
  if p_subtotal is null or p_subtotal < 0 or p_subtotal > 10000000 then
    return jsonb_build_object('valid',false,'error','Invalid cart amount.');
  end if;
  select * into c from public.coupons where code=upper(trim(p_code)) and active
    and (starts_at is null or starts_at <= now()) and (expires_at is null or expires_at > now());
  if not found then return jsonb_build_object('valid',false,'error','This coupon is invalid, inactive or expired.'); end if;
  if p_subtotal < c.min_order then return jsonb_build_object('valid',false,'error','Minimum product total: ৳' || c.min_order); end if;
  d := case when c.discount_type='percent' then round(p_subtotal*c.amount/100,2) else c.amount end;
  d := least(p_subtotal,d,coalesce(c.max_discount,d));
  return jsonb_build_object('valid',true,'code',c.code,'discount',d);
end; $$;
revoke all on function public.quote_coupon(text,numeric) from public;
grant execute on function public.quote_coupon(text,numeric) to anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.create_secure_order(p_order jsonb, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_order_id bigint;
  v_order_number text;
  v_item jsonb;
  v_quote jsonb;
  v_discount numeric := 0;
  v_code text := nullif(upper(trim(p_order->>'coupon_code')),'');
begin
  v_order_number := p_order->>'order_number';
  if v_code is not null then
    perform 1 from public.coupons where code=v_code for share;
    v_quote := public.quote_coupon(v_code,(p_order->>'subtotal')::numeric);
    if not (v_quote->>'valid')::boolean then raise exception 'Coupon unavailable. Please apply it again.'; end if;
    v_discount := (v_quote->>'discount')::numeric;
  end if;
  if v_discount <> coalesce((p_order->>'discount_amount')::numeric,0) then
    raise exception 'Coupon changed. Please check the updated total.';
  end if;
  if (p_order->>'total')::numeric <> (p_order->>'subtotal')::numeric - v_discount + (p_order->>'delivery_fee')::numeric + (p_order->>'express_fee')::numeric then
    raise exception 'Order total mismatch.';
  end if;

  insert into public.orders (
    order_number, customer_name, phone, customer_email, address, area,
    pathao_city_id, pathao_city_name, pathao_zone_id, pathao_zone_name,
    pathao_area_id, pathao_area_name, payment_method, payment_option,
    subtotal, delivery_fee, delivery_speed, express_fee, total,
    advance_method, advance_transaction_id, advance_amount, remaining_cod,
    coupon_code, discount_amount, payment_status, status
  )
  values (
    v_order_number, p_order->>'customer_name', p_order->>'phone',
    p_order->>'customer_email', p_order->>'address', p_order->>'area',
    (p_order->>'pathao_city_id')::integer, p_order->>'pathao_city_name',
    (p_order->>'pathao_zone_id')::integer, p_order->>'pathao_zone_name',
    (p_order->>'pathao_area_id')::integer, p_order->>'pathao_area_name',
    p_order->>'payment_method', p_order->>'payment_option',
    (p_order->>'subtotal')::numeric, (p_order->>'delivery_fee')::numeric,
    p_order->>'delivery_speed', (p_order->>'express_fee')::numeric,
    (p_order->>'total')::numeric, p_order->>'advance_method',
    p_order->>'advance_transaction_id', (p_order->>'advance_amount')::numeric,
    (p_order->>'remaining_cod')::numeric, v_code, v_discount, 'pending_verification', 'Pending Payment'
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (
      order_id, product_id, product_name, quantity, price, cost
    )
    values (
      v_order_id, (v_item->>'product_id')::bigint, v_item->>'product_name',
      (v_item->>'quantity')::integer, (v_item->>'price')::numeric,
      (v_item->>'cost')::numeric
    );
  end loop;

  return jsonb_build_object('id', v_order_id, 'order_number', v_order_number);
end;
$function$;
commit;
