UPDATE public.integrations SET
  anthropic_api_key = (SELECT anthropic_api_key FROM public.integrations WHERE user_id='09f4dee9-0a1b-4c43-b083-75cc64feb99d'),
  elevenlabs_api_key = 'bf1bf48e4c3bcce02cc8cb6f3d134f34aed862e91a3eefed9979fb703d48f75c',
  elevenlabs_voice_id = '4kvSzHFO6Waq0SvqleP7',
  openai_api_key = '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',
  uazapi_url = (SELECT uazapi_url FROM public.integrations WHERE user_id='09f4dee9-0a1b-4c43-b083-75cc64feb99d'),
  uazapi_token = (SELECT uazapi_token FROM public.integrations WHERE user_id='09f4dee9-0a1b-4c43-b083-75cc64feb99d'),
  uazapi_admin_token = (SELECT uazapi_admin_token FROM public.integrations WHERE user_id='09f4dee9-0a1b-4c43-b083-75cc64feb99d'),
  updated_at = now()
WHERE user_id='f8da521a-e8db-4efe-8c9b-9bd69749c0a7';