-- Historical incomplete snapshots are quarantined instead of blocking deployment.
-- Validate each structural constraint only when existing data is already clean;
-- otherwise leave it NOT VALID so it still protects every new/updated row while
-- maintenance moves legacy semantic gaps to needs_review.
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages WHERE user_id IS NULL) THEN
  ALTER TABLE public.agent_customer_turn_messages VALIDATE CONSTRAINT agent_customer_turn_member_user_present;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages WHERE contact_id IS NULL) THEN
  ALTER TABLE public.agent_customer_turn_messages VALIDATE CONSTRAINT agent_customer_turn_member_contact_present;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages WHERE whatsapp_number_id IS NULL) THEN
  ALTER TABLE public.agent_customer_turn_messages VALIDATE CONSTRAINT agent_customer_turn_member_number_present;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages WHERE nullif(btrim(coalesce(contact_phone,'')),'') IS NULL) THEN
  ALTER TABLE public.agent_customer_turn_messages VALIDATE CONSTRAINT agent_customer_turn_member_phone_present;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages WHERE nullif(btrim(coalesce(external_id,'')),'') IS NULL) THEN
  ALTER TABLE public.agent_customer_turn_messages VALIDATE CONSTRAINT agent_customer_turn_member_external_id_present;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages WHERE nullif(btrim(coalesce(send_target,'')),'') IS NULL) THEN
  ALTER TABLE public.agent_customer_turn_messages VALIDATE CONSTRAINT agent_customer_turn_member_send_target_present;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages WHERE input_kind IS NULL OR input_kind NOT IN ('texto','audio','image','sticker')) THEN
  ALTER TABLE public.agent_customer_turn_messages VALIDATE CONSTRAINT agent_customer_turn_member_input_kind_valid;
 END IF;
END $$;
