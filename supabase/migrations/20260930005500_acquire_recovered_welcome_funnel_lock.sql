create or replace function public.acquire_recovered_welcome_funnel_lock(
 p_funnel_id uuid,p_contact_id uuid,p_conversation_id uuid,p_user_id uuid,p_workspace_id uuid,p_holder text
) returns boolean
language plpgsql security definer set search_path=public
as $$
begin
 if p_holder is null or btrim(p_holder)='' then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31));
 if exists(select 1 from public.agent_generation_locks where conversation_id=p_conversation_id) then return false; end if;
 if exists(select 1 from public.agent_inbound_jobs where conversation_id=p_conversation_id and status in ('processing_safe','processing'))
 or exists(select 1 from public.agent_customer_turns where conversation_id=p_conversation_id and state in ('processing_safe','processing')) then return false; end if;
 if not exists(
  select 1 from public.welcome_funnel_execution_state f
  where f.funnel_id=p_funnel_id and f.contact_id=p_contact_id and f.conversation_id=p_conversation_id
  and f.user_id=p_user_id and f.workspace_id=p_workspace_id and f.status='running' and f.last_completed_step is null
  and not exists(select 1 from public.messages m where m.conversation_id=p_conversation_id and m.sender='agente' and m.created_at>=f.started_at-interval '2 minutes')
 ) then return false; end if;
 insert into public.agent_generation_locks(conversation_id,holder,acquired_at) values(p_conversation_id,p_holder,now());
 return true;
end;
$$;
revoke all on function public.acquire_recovered_welcome_funnel_lock(uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.acquire_recovered_welcome_funnel_lock(uuid,uuid,uuid,uuid,uuid,text) to service_role;
