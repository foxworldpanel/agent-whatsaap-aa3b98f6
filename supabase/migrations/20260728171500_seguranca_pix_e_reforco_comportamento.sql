-- Módulo "Segurança Pix" (versão segura): explica o alerta de segurança que os
-- bancos brasileiros vêm exibindo em transferências Pix, SEM instruir o cliente
-- a ignorar o alerta do próprio banco, e SEM esconder informação sobre pra quem
-- o pagamento vai, caso o cliente pergunte diretamente.
INSERT INTO public.agent_modules_v3 (
  user_id, workspace_id, key, name, content, category, always_load, priority, version,
  selector_triggers, selector_intents
)
VALUES (
  'f8da521a-e8db-4efe-8c9b-9bd69749c0a7',
  'bd59fa41-d68d-4ac8-b995-e09ae48f52aa',
  'seguranca_pix',
  'Segurança Pix',
  'SEGURANÇA PIX

Use este módulo quando o cliente mencionar: golpe, risco, fraude, conta suspeita, banco bloqueou, alerta de segurança, Pix recusado, "apareceu uma mensagem".

RESPOSTA:
"Entendi sua preocupação! 😊 Os bancos têm mostrado esse tipo de alerta com mais frequência ultimamente como parte das medidas de segurança contra fraude — é algo comum em várias transações, não só com a gente."
===SPLIT===
"A decisão de prosseguir é sempre sua. Se tiver dúvida, pode confirmar direto com seu banco antes, ou começar com uma recarga pequena (R$5) pra se sentir mais segura antes de valores maiores."

REGRAS ABSOLUTAS:
- NUNCA instrui o cliente a clicar em "prosseguir" ou "cancelar" — a decisão de prosseguir com o próprio banco é sempre do cliente, nunca da Júlia.
- NUNCA diz que o banco está errado ou que o alerta é falso.
- NUNCA afirma que é obrigatório prosseguir.
- Se o cliente perguntar diretamente pra qual empresa/conta o pagamento vai, responde com a informação real disponível — nunca esconde nem se recusa a informar.
- Se o cliente continuar inseguro mesmo depois da explicação, ou disser que o banco bloqueou definitivamente, direciona pro Suporte/ticket do painel para falar com um humano.',
  'Pagamentos',
  false,
  90,
  1,
  ARRAY['golpe','risco','fraude','suspeita','suspeito','bloqueou','bloqueado','alerta','pix recusado','apareceu uma mensagem','prosseguir','cancelar pix'],
  ARRAY['duvida_seguranca','pagamento']
)
ON CONFLICT (workspace_id, key) DO UPDATE SET
  content = EXCLUDED.content,
  always_load = EXCLUDED.always_load,
  priority = EXCLUDED.priority,
  selector_triggers = EXCLUDED.selector_triggers,
  selector_intents = EXCLUDED.selector_intents,
  updated_at = now();

-- Reforça o comportamento_humano com a instrução de SPLIT mais explícita,
-- caso o conteúdo em produção ainda esteja na versão curta/genérica encontrada
-- na migration de seed original.
UPDATE public.agent_modules_v3
SET content = content || E'\n\nREFORÇO — DIVISÃO DE MENSAGEM (CRÍTICO):\nSempre que a resposta tiver mais de uma ideia (ex: uma afirmação seguida de uma pergunta), separe com ===SPLIT=== entre as partes. Nunca junte afirmação e pergunta na mesma bolha, mesmo que o texto total seja curto.',
    updated_at = now()
WHERE workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa'
  AND key = 'comportamento_humano'
  AND content NOT LIKE '%REFORÇO — DIVISÃO DE MENSAGEM%';
