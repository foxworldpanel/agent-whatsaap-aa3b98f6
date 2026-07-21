-- Segurança: nenhuma credencial de provedor é semeada pelo repositório.
-- Mantém apenas referências já existentes no banco, sem segredos literais.
UPDATE public.integrations SET
  uazapi_url = (SELECT uazapi_url FROM public.integrations WHERE user_id='09f4dee9-0a1b-4c43-b083-75cc64feb99d'),
  uazapi_token = (SELECT uazapi_token FROM public.integrations WHERE user_id='09f4dee9-0a1b-4c43-b083-75cc64feb99d'),
  uazapi_admin_token = (SELECT uazapi_admin_token FROM public.integrations WHERE user_id='09f4dee9-0a1b-4c43-b083-75cc64feb99d'),
  updated_at = now()
WHERE user_id='f8da521a-e8db-4efe-8c9b-9bd69749c0a7';
