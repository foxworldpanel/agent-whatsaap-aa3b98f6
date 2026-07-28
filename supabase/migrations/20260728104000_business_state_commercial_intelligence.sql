-- Agent V3: amplia o estado comercial sem criar uma segunda fonte de verdade.
alter table public.conversation_business_state_v3
  add column if not exists objective text,
  add column if not exists purchase_score integer,
  add column if not exists confidence_score integer,
  add column if not exists urgency_score integer,
  add column if not exists waiting_customer boolean not null default false;

update public.conversation_business_state_v3
set waiting_customer = true
where state = 'adiado' and waiting_customer = false;

create index if not exists idx_conversation_business_state_v3_waiting
  on public.conversation_business_state_v3(workspace_id, waiting_customer, updated_at desc);
