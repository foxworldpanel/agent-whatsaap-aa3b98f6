-- Agent V3: estado comercial persistente por conversa.
create table if not exists public.conversation_business_state_v3 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workspace_id uuid not null,
  conversation_id uuid not null,
  state text not null default 'novo_lead',
  risk_level text not null default 'normal',
  reason text,
  next_action text,
  summary text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (workspace_id, conversation_id)
);

create index if not exists idx_conversation_business_state_v3_workspace
  on public.conversation_business_state_v3(workspace_id, updated_at desc);

alter table public.conversation_business_state_v3 enable row level security;

drop policy if exists "conversation_business_state_v3_owner" on public.conversation_business_state_v3;
create policy "conversation_business_state_v3_owner"
on public.conversation_business_state_v3
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
