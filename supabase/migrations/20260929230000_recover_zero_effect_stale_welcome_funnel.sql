-- Safely recovers only stale Welcome Funnel executions with zero outbound agent evidence.
create or replace function public.recover_zero_effect_stale_welcome_funnel(p_funnel_id uuid,p_contact_id uuid,p_conversation_id uuid,p_user_id uuid,p_workspace_id uuid) returns boolean language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_updated int:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,31));
 if exists(select 1 from public.welcome_funnel_legacy_claim_baseline b where b.funnel_id=p_funnel_id and b.contact_id=p_contact_id) then raise exception 'historical baseline blocks zero-effect recovery' using errcode='55000'; end if;
 if exists(select 1 from public.messages m where m.conversation_id=p_conversation_id and m.sender='agente' and m.created_at >= (select s.started_at-interval '2 minutes' from public.welcome_funnel_execution_state s where s.funnel_id=p_funnel_id and s.contact_id=p_contact_id and s.conversation_id=p_conversation_id)) then raise exception 'agent message evidence blocks zero-effect recovery' using errcode='55000'; end if;
 perform set_config('welcome_funnel.zero_effect_stale_recovery','1',true);
 update public.welcome_funnel_execution_state s set status='running',error_message=null,completed_at=null,updated_at=now()
 where s.funnel_id=p_funnel_id and s.contact_id=p_contact_id and s.conversation_id=p_conversation_id and s.user_id=p_user_id and s.workspace_id=p_workspace_id and s.status='needs_review' and s.last_completed_step is null and s.error_message='stale Welcome Funnel runtime recovered after uncertain external side effects';
 get diagnostics v_updated=row_count;
 perform set_config('welcome_funnel.zero_effect_stale_recovery','',true);
 if v_updated<>1 then return false; end if;
 update public.conversations c set needs_review=false,review_reason=null,auto_paused_at=null,funnel_status='not_started' where c.id=p_conversation_id and c.user_id=p_user_id and c.workspace_id=p_workspace_id;
 return true;
end $$;
create or replace function public.guard_welcome_funnel_execution_state_transition() returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$
begin
 if new.funnel_id is distinct from old.funnel_id or new.contact_id is distinct from old.contact_id or new.conversation_id is distinct from old.conversation_id or new.user_id is distinct from old.user_id or new.workspace_id is distinct from old.workspace_id or new.started_at is distinct from old.started_at then raise exception 'welcome funnel execution identity is immutable'; end if;
 if old.status='needs_review' and new.status='running' and current_setting('welcome_funnel.false_quarantine_recovery',true)='1' and old.last_completed_step is null and old.error_message='legacy Welcome Funnel claim has no historical baseline or durable completion evidence' and new.last_completed_step is null then return new; end if;
 if old.status='needs_review' and new.status='running' and current_setting('welcome_funnel.zero_effect_stale_recovery',true)='1' and old.last_completed_step is null and old.error_message='stale Welcome Funnel runtime recovered after uncertain external side effects' and new.last_completed_step is null then return new; end if;
 if old.status in('completed','needs_review') and new is distinct from old then raise exception 'welcome funnel terminal execution state is immutable'; end if;
 if old.status='running' and new.status not in('running','completed','needs_review') then raise exception 'invalid welcome funnel execution transition: % -> %',old.status,new.status; end if;
 if old.last_completed_step is not null then
  if new.last_completed_step is null then raise exception 'welcome funnel checkpoint cannot move backwards'; end if;
  if array_position(array['welcome_text','audio','panel_text','video','services_text']::text[],new.last_completed_step)<array_position(array['welcome_text','audio','panel_text','video','services_text']::text[],old.last_completed_step) then raise exception 'welcome funnel checkpoint cannot move backwards'; end if;
 end if;
 return new;
end $$;
revoke all on function public.recover_zero_effect_stale_welcome_funnel(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.recover_zero_effect_stale_welcome_funnel(uuid,uuid,uuid,uuid,uuid) to service_role;
