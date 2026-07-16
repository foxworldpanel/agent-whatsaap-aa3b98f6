-- Ensure workspaces table has proper RLS and grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;

-- Ensure a default workspace exists for every user that has logged in
-- This is a safety measure in case the normal creation flow failed
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN SELECT id FROM auth.users LOOP
        IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE user_id = user_record.id) THEN
            INSERT INTO public.workspaces (user_id, nome, icone, cor, is_default)
            VALUES (user_record.id, 'Meu Workspace', '📱', 'blue', true);
        ELSIF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE user_id = user_record.id AND is_default = true) THEN
            UPDATE public.workspaces 
            SET is_default = true 
            WHERE id = (SELECT id FROM public.workspaces WHERE user_id = user_record.id LIMIT 1);
        END IF;
    END LOOP;
END
$$;

-- Ensure agent_config exists for existing workspaces to avoid errors
DO $$
DECLARE
    ws_record RECORD;
BEGIN
    FOR ws_record IN SELECT id, user_id FROM public.workspaces LOOP
        INSERT INTO public.agent_config (user_id, workspace_id, agent_name, tone, base_instruction, main_offer, audio_enabled)
        VALUES (ws_record.user_id, ws_record.id, 'Júlia', 'Amigável', 'Sou a Júlia, sua assistente virtual.', 'Serviços SMM', false)
        ON CONFLICT (user_id, workspace_id) DO NOTHING;
    END LOOP;
END
$$;
