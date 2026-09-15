-- Historical incomplete snapshots are quarantined instead of blocking deployment.
-- Validate each structural constraint only when the constraint exists and existing
-- data is already clean. Missing constraints are left to their owning migration;
-- dirty historical rows keep NOT VALID protection for new writes while maintenance
-- moves unreconstructable semantic gaps to needs_review.
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.agent_customer_turn_messages'::regclass AND conname='agent_customer_turn_member_user_present')
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages WHERE user_id IS NULL) THEN
  ALTER TABLE public.agent_customer_turn_messages VALIDATE CONSTRAINT agent_customer_turn_member_user_present;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.agent_customer_turn_messages'::regclass AND conname='agent_customer_turn_member_contact_present')
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages WHERE contact_id IS NULL) THEN
  ALTER TABLE public.agent_customer_turn_messages VALIDATE CONSTRAINT agent_customer_turn_member_contact_present;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.agent_customer_turn_messages'::regclass AND conname='agent_customer_turn_member_number_present')
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages WHERE whatsapp_number_id IS NULL) THEN
  ALTER TABLE public.agent_customer_turn_messages VALIDATE CONSTRAINT agent_customer_turn_member_number_present;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.agent_customer_turn_messages'::regclass AND conname='agent_customer_turn_member_phone_present')
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages WHERE nullif(btrim(coalesce(contact_phone,'')),'') IS NULL) THEN
  ALTER TABLE public.agent_customer_turn_messages VALIDATE CONSTRAINT agent_customer_turn_member_phone_present;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.agent_customer_turn_messages'::regclass AND conname='agent_customer_turn_member_external_id_present')
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages WHERE nullif(btrim(coalesce(external_id,'')),'') IS NULL) THEN
  ALTER TABLE public.agent_customer_turn_messages VALIDATE CONSTRAINT agent_customer_turn_member_external_id_present;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.agent_customer_turn_messages'::regclass AND conname='agent_customer_turn_member_send_target_present')
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages WHERE nullif(btrim(coalesce(send_target,'')),'') IS NULL) THEN
  ALTER TABLE public.agent_customer_turn_messages VALIDATE CONSTRAINT agent_customer_turn_member_send_target_present;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.agent_customer_turn_messages'::regclass AND conname='agent_customer_turn_member_input_kind_valid')
    AND NOT EXISTS(SELECT 1 FROM public.agent_customer_turn_messages WHERE input_kind IS NULL OR input_kind NOT IN ('texto','audio','image','sticker')) THEN
  ALTER TABLE public.agent_customer_turn_messages VALIDATE CONSTRAINT agent_customer_turn_member_input_kind_valid;
 END IF;
END $$;
