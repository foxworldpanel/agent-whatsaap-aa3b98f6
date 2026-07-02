UPDATE public.agent_config AS dst
SET
  agent_name = COALESCE(NULLIF(TRIM(src.agent_name), ''), 'Júlia'),
  tone = src.tone,
  base_instruction = src.base_instruction,
  script_frio = src.script_frio,
  script_inativo = src.script_inativo,
  script_ativo = src.script_ativo,
  panel_link = src.panel_link,
  main_offer = src.main_offer,
  audio_enabled = src.audio_enabled,
  response_delay_min_sec = src.response_delay_min_sec,
  response_delay_max_sec = src.response_delay_max_sec,
  typing_indicator_enabled = src.typing_indicator_enabled,
  company_info = src.company_info,
  how_it_works = src.how_it_works,
  never_offer_first = src.never_offer_first,
  send_panel_on_price = src.send_panel_on_price,
  faqs = src.faqs,
  services_realtime = src.services_realtime,
  price_query_instruction = src.price_query_instruction,
  modules = src.modules,
  modules_enabled = src.modules_enabled,
  catalog_in_prompt = src.catalog_in_prompt,
  catalog_only_relevant = src.catalog_only_relevant,
  updated_at = now()
FROM public.agent_config AS src
WHERE dst.user_id = 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7'
  AND src.user_id = '09f4dee9-0a1b-4c43-b083-75cc64feb99d';