begin;
alter table public.products add column customizable boolean not null default false;
-- Existing, owner-selected wedding items only. Ready-made diya sets stay false.
update public.products set customizable=true where id in (8,9,10,11,12,13);
commit;
