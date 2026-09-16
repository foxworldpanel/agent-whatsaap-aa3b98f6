-- Provider message ids are the durable dedupe key. When UAZAPI omits one, the
-- legacy webhook synthesizes an fb:* value from a 10-second bucket + content hash.
-- Two genuinely distinct identical messages in that bucket therefore collide and
-- the second can be silently classified as a retransmission. Prefer possible
-- duplicate replay over guaranteed loss: fallback identities are made unique at
-- the persistence boundary until the webhook source is fully centralized.
CREATE OR REPLACE FUNCTION public.uniquify_fallback_message_external_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.external_id LIKE 'fb:%' THEN
  NEW.external_id := NEW.external_id || ':' || gen_random_uuid()::text;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS uniquify_fallback_message_external_id ON public.messages;
CREATE TRIGGER uniquify_fallback_message_external_id
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.uniquify_fallback_message_external_id();
REVOKE ALL ON FUNCTION public.uniquify_fallback_message_external_id() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.uniquify_fallback_message_external_id() TO service_role;
