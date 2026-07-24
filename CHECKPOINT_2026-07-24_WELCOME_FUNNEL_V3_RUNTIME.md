# Checkpoint — Funil de boas-vindas conectado ao Agent V3

## Fluxo operacional

No webhook Uazapi, depois que a mensagem inbound é persistida e os gates do agente
são validados, o runtime agora verifica os funis ativos do número conectado.

A ordem é:

1. identifica o primeiro funil ativo cujo gatilho está contido na mensagem;
2. reserva a execução em `welcome_funnel_runs` com status `running`;
3. bloqueia o Agent V3 durante todo o funil;
4. executa as etapas habilitadas na ordem configurada:
   - texto de boas-vindas (opcional);
   - áudio;
   - texto/link do painel;
   - vídeo;
   - tabela/texto resumido de serviços;
5. marca o run como `completed`;
6. encerra o turno do gatilho sem chamar a IA;
7. a partir da próxima mensagem do cliente, o Agent V3 assume normalmente.

Para o fluxo Meta Ads desejado, deixe o passo **Texto de boas-vindas** desligado.
Assim o áudio é a primeira resposta, seguido de painel, vídeo e tabela.

## Proteções

- Uma vez por contato e por funil, preservando a PK existente.
- Claim no banco impede duas instâncias de dispararem juntas.
- Mensagens recebidas enquanto `status = running` não acordam o Agent V3.
- Run órfão com mais de 20 minutos é recuperado como `failed`.
- Em falha de envio, o run vira `failed` e a conversa é marcada para revisão.
- Cada outbound do funil é persistido no CRM.
- Runs históricos permanecem `completed`.

## Gatilhos

Os gatilhos continuam sendo configurados no menu **Números**, separados por vírgula.
A comparação é case-insensitive e ignora acentos.

Exemplo:
`tenho interesse em divulgar minha música, divulgar minha música`

A frase:
`Olá, tenho interesse em divulgar minha música`
aciona esse funil.

## Observação operacional

Os delays do próprio funil continuam sendo usados para a sequência. Evite somar delays
muito longos em hospedagens com timeout HTTP curto; para campanhas, delays de poucos
segundos entre passos são os mais seguros.
