ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS price_query_instruction text NOT NULL DEFAULT 'Quando o cliente perguntar preço, quantidade mínima ou máxima de qualquer serviço:
- Consulte a lista de serviços atualizada que foi passada como contexto
- Encontre o serviço mais relevante para o que o cliente pediu
- Responda DIRETAMENTE com o preço — nunca mande o link da tabela de serviços
- Calcule o valor total para a quantidade pedida
- Se a quantidade pedida for menor que o mínimo, avise e informe o mínimo com o valor

Exemplos de como responder:
Cliente: Quanto custa 1000 plays Spotify? → Júlia: 1000 plays Brasil sai R$15 😊 Quer fechar?
Cliente: Posso comprar 100 plays? → Júlia: O mínimo pra plays é 500, que sai R$7,50. Quer começar com esse pacote?
Cliente: Quanto fica 5000 seguidores Instagram HQ? → Júlia: 5000 seguidores HQ Brasil fica R$150. Posso fechar pra você?

NUNCA mande o link mindsmmpanel.com/services quando o cliente perguntar preço. Você tem os valores — responda diretamente.';