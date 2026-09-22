create index if not exists agent_tasks_created_by_idx on public.agent_tasks(created_by);
create index if not exists agent_tasks_start_approved_by_idx on public.agent_tasks(start_approved_by);
create index if not exists agent_tasks_completion_approved_by_idx on public.agent_tasks(completion_approved_by);
create index if not exists agent_tasks_status_created_at_idx on public.agent_tasks(status, created_at desc);

drop policy if exists "Owner can read agent tasks" on public.agent_tasks;
create policy "Owner can read agent tasks" on public.agent_tasks for select to authenticated
using (
  (select auth.uid()) = '5beecdb3-5e80-4a35-9133-5fc01ab7a772'::uuid
  and (select auth.jwt())->>'aal' = 'aal2'
);

drop policy if exists "Owner can create agent tasks" on public.agent_tasks;
create policy "Owner can create agent tasks" on public.agent_tasks for insert to authenticated
with check (
  (select auth.uid()) = '5beecdb3-5e80-4a35-9133-5fc01ab7a772'::uuid
  and created_by = (select auth.uid())
  and (select auth.jwt())->>'aal' = 'aal2'
);

drop policy if exists "Owner can update agent tasks" on public.agent_tasks;
create policy "Owner can update agent tasks" on public.agent_tasks for update to authenticated
using (
  (select auth.uid()) = '5beecdb3-5e80-4a35-9133-5fc01ab7a772'::uuid
  and (select auth.jwt())->>'aal' = 'aal2'
)
with check (
  (select auth.uid()) = '5beecdb3-5e80-4a35-9133-5fc01ab7a772'::uuid
  and created_by = '5beecdb3-5e80-4a35-9133-5fc01ab7a772'::uuid
  and (select auth.jwt())->>'aal' = 'aal2'
);
