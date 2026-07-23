# Checkpoint — Final Delivery Consistency

Base: `agent-whatsaap-aa3b98f6-main(38).zip`

## Correções

1. O helper de envio utilizado pelo Agent V3 não importa mais `humanizePunctuation` de `ai.server.ts` (legado). A normalização de pontuação agora usa o guard próprio da V3.
2. `humanizePunctuationV3` foi reforçado para tratar em-dash/en-dash colado ou cercado por espaços sem criar pontuação duplicada.
3. O splitter do orchestrator agora é respeitado no webhook: cada `reply` é realmente enviada como parte separada em texto, em vez de ser reunida novamente por `join()` antes do envio.
4. O histórico V3 passa a salvar exatamente o texto efetivamente entregue ao cliente após humanização e remoção de emoji consecutivo. Isso evita divergência entre memória e WhatsApp.
5. O guard de emoji considera também as partes já enviadas no mesmo turno, evitando emojis em mensagens consecutivas dentro da mesma resposta multipartes.

## Observação

Para respostas em áudio, o histórico continua registrando o texto que foi usado como fonte do TTS, que é o conteúdo efetivamente narrado.
