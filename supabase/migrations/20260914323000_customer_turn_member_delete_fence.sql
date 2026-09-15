-- Once a job/message is attached to a Customer Turn it is part of a durable
-- semantic execution record. ON DELETE CASCADE on those source FKs could erase a
-- member before runtime and silently lose customer input. Keep cascade only from
-- the owning turn; source deletion must be rejected while membership exists.

ALTER TABLE public.agent_customer_turn_messages
  DROP CONSTRAINT IF EXISTS agent_customer_turn_messages_job_id_fkey,
  DROP CONSTRAINT IF EXISTS agent_customer_turn_messages_message_id_fkey;

ALTER TABLE public.agent_customer_turn_messages
  ADD CONSTRAINT agent_customer_turn_messages_job_id_fkey
    FOREIGN KEY (job_id) REFERENCES public.agent_inbound_jobs(id) ON DELETE RESTRICT,
  ADD CONSTRAINT agent_customer_turn_messages_message_id_fkey
    FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE RESTRICT;
