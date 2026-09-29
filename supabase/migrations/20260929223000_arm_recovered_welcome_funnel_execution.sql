-- Safely arms a recovered Welcome Funnel execution for an exact-holder runtime resume.
create or replace function public.arm_recovered_welcome_funnel_execution(p_funnel_id uuid,p_contact_id uuid,p_conversation_id uuid,p_user_id uuid,p_workspace_id uuid,p_holder text) returns boolean language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_updated int:=0;
begin
 if nullif(btrim(p_holder),'') is null then raise exception 'welcome funnel recovery holder required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31));
 if not exists(select 1 from public.agent_generation_locks g where g.conversation_id=p_conversation_id and g.holder=p_holder) then raise exception 'welcome funnel recovery requires exact holder' using errcode='55000'; end if;
 update public.welcome_funnel_execution_state s set updated_at=now(),error_message=null
 where s.funnel_id=p_funnel_id and s.contact_id=p_contact_id and s.conversation_id=p_conversation_id and s.user_id=p_user_id and s.workspace_id=p_workspace_id and s.status='running' and s.last_completed_step is null
 and not exists(select 1 from public.messages m where m.conversation_id=p_conversation_id and m.sender='agente' and m.created_at>=s.started_at-interval '2 minutes');
 get diagnostics v_updated=row_count; return v_updated=1;
end $$;
revoke all on function public.arm_recovered_welcome_funnel_execution(uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.arm_recovered_welcome_funnel_execution(uuid,uuid,uuid,uuid,uuid,text) to service_role;
