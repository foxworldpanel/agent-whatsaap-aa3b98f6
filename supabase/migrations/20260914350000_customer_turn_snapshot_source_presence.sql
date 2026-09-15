-- A sealed Customer Turn may legitimately have a null CRM source, so null remains
-- part of the snapshot domain. This migration hardens only structural snapshot
-- completeness that can be enforced without changing historical semantics.
ALTER TABLE public.agent_customer_turn_messages
  ADD CONSTRAINT agent_customer_turn_member_external_id_present
    CHECK (nullif(btrim(external_id),'') IS NOT NULL) NOT VALID,
  ADD CONSTRAINT agent_customer_turn_member_send_target_present
    CHECK (nullif(btrim(send_target),'') IS NOT NULL) NOT VALID,
  ADD CONSTRAINT agent_customer_turn_member_input_kind_valid
    CHECK (input_kind IN ('texto','audio','image','sticker')) NOT VALID;

-- New rows are already protected by snapshot_agent_customer_turn_member().
-- Keep these constraints NOT VALID so historical rows can be quarantined by the
-- maintenance worker rather than making migration deployment fail atomically.
