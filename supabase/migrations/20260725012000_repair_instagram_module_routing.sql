-- Agent V3: normaliza metadados dos módulos modulares de Instagram.
-- Não altera content, preços, enabled ou version.

UPDATE public.agent_modules_v3
SET
  selector_platforms = CASE
    WHEN NOT ('instagram' = ANY(selector_platforms))
      THEN array_append(selector_platforms, 'instagram')
    ELSE selector_platforms
  END,
  updated_at = now()
WHERE workspace_id IS NOT NULL
  AND key LIKE 'instagram_%';

UPDATE public.agent_modules_v3
SET
  selector_products = CASE
    WHEN content ILIKE '%seguidor%'
      AND NOT ('seguidores' = ANY(selector_products))
      THEN array_append(selector_products, 'seguidores')
    ELSE selector_products
  END,
  updated_at = now()
WHERE workspace_id IS NOT NULL
  AND key LIKE 'instagram_%';

-- Módulos de preço/variações de seguidores devem participar de consulta,
-- negociação e fechamento. O conteúdo continua sendo a fonte da verdade.
UPDATE public.agent_modules_v3
SET
  selector_intents = ARRAY(
    SELECT DISTINCT x
    FROM unnest(
      selector_intents || ARRAY['consulta_preco','compra']::text[]
    ) AS x
  ),
  selector_stages = ARRAY(
    SELECT DISTINCT x
    FROM unnest(
      selector_stages || ARRAY['negociacao','fechamento']::text[]
    ) AS x
  ),
  updated_at = now()
WHERE workspace_id IS NOT NULL
  AND key LIKE 'instagram_%'
  AND content ILIKE '%seguidor%'
  AND (
    content ILIKE '%R$%'
    OR content ILIKE '%promo%'
    OR content ILIKE '%premium%'
    OR content ILIKE '%global%'
    OR content ILIKE '%brasil%'
  );
