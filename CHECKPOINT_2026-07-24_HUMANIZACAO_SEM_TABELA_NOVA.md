# Checkpoint — Humanização sem tabela nova

Problema:
o ambiente de produção não possui `public.agent_humanization_settings`, então a tela
falhava com erro de schema cache.

Correção:
- o recurso passa a usar `public.agent_config`, tabela já existente;
- configurações completas são armazenadas dentro de `agent_config.modules` na chave
  reservada `__humanization_settings`;
- `response_delay_min_sec`, `response_delay_max_sec` e
  `typing_indicator_enabled` continuam sincronizados para compatibilidade;
- webhook e Playground leem do mesmo local;
- o runtime não depende mais de `agent_humanization_settings`.

Isso elimina a necessidade de criar uma nova tabela só para esse recurso.
