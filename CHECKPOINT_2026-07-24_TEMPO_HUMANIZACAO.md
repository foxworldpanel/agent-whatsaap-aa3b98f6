# Checkpoint — Tempo e Humanização

## Adicionado

Nova aba **Agente > Tempo e Humanização**, configurável por workspace.

Preset padrão:
- humanização: ativa;
- primeira resposta: 1,5 a 8 segundos;
- tempo proporcional ao tamanho da resposta;
- pequena variação aleatória;
- presença “digitando...” ativa;
- mensagens multipartes: 1,2 a 2,8 segundos entre partes;
- presença “gravando áudio...” ativa;
- Playground: atraso desligado.

## Runtime WhatsApp

O cronômetro começa quando o webhook recebe a mensagem. O tempo já gasto com banco,
Claude e TTS é descontado do atraso artificial. Isso evita somar 8 segundos depois de
uma resposta que já levou vários segundos para ser processada.

Enquanto a resposta em texto está sendo processada, a Uazapi recebe presença
`composing`. Para áudio, usa `recording` antes do envio.

## Banco

Criada `agent_humanization_settings`, uma configuração por workspace, com RLS baseada
em ownership real. `service_role` continua autorizado para o webhook.

## Playground

Permanece sem atraso por padrão para facilitar a lapidação das conversas. O painel
permite ativar a simulação também no Playground, caso seja necessário.

## Testes

Adicionado `tests/agent-v3/humanization-timing.test.ts`.
