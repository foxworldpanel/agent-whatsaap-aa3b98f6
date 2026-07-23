# Checkpoint — Remove False Echo Guard

Data: 2026-07-23
Base: agent-whatsaap-aa3b98f6-main(35)

## Problema
O webhook mantinha uma memória de 10 segundos baseada apenas em `phone + primeiros 20 caracteres do texto` para decidir se uma mensagem recebida era uma repetição de algo enviado pelo agente.

Esse mecanismo podia descartar mensagens legítimas do cliente quando elas começavam com os mesmos 20 caracteres de uma resposta recente. Além disso, mensagens `fromMe` já são interrompidas antes do Agent V3 e a deduplicação por `messageId`/`external_id` já cobre retransmissões reais do provedor.

## Correção
- Removidos `recentSendsMem`, `recentSendKey`, `memWasRecentlySent` e `memMarkSent`.
- Removido o gate `ok (recently sent)` do fluxo de entrada.
- Mantidas as proteções corretas: `fromMe`, deduplicação por `messageId`, persistência por `external_id` e lock por conversa.

## Resultado
Uma mensagem válida do cliente não pode mais ser silenciosamente descartada só por coincidir parcialmente com uma resposta enviada poucos segundos antes.
