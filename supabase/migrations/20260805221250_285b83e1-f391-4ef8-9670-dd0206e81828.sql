-- 1. Excluir execuções travadas (para permitir novo disparo)
DELETE FROM public.welcome_funnel_runs 
WHERE contact_id = 'e20f2b60-a240-40c1-b23a-1eb0dcff6ae5';

-- 2. Limpar gatilhos de espaços invisíveis e normalizar
UPDATE public.welcome_funnels 
SET trigger_keywords = TRIM(BOTH ' ' FROM trigger_keywords)
WHERE id = 'fb5bbb70-091d-490f-99bc-845f87700a3d';

-- 3. Validar mudança
SELECT id, trigger_keywords, LENGTH(trigger_keywords) as len, encode(trigger_keywords::bytea, 'hex') as hex
FROM public.welcome_funnels 
WHERE id = 'fb5bbb70-091d-490f-99bc-845f87700a3d';