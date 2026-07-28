# Central de Controle do Funil

## Objetivo
Dar visibilidade operacional completa do funil sem consultar banco/log manualmente.

## Nova página
Menu principal: `Central do Funil` (`/funis`)

### Indicadores
- Em andamento
- Enviados/concluídos
- Falhas
- Pausados
- Travados (>15 min sem progresso)
- Taxa de sucesso nas últimas 24h

### Lista operacional
Por execução:
- cliente + telefone + foto
- funil
- número WhatsApp
- status
- progresso/última etapa
- horário
- categoria do erro
- motivo técnico
- número de tentativas

### Ações
- Pausar execução
- Retomar execução
- Reenviar falha
- Reenviar falhos em lote (até 10 por operação)
- Abrir conversa
- Ver linha do tempo

## Segurança contra duplicação
O retry NÃO recomeça o funil inteiro.
Ele usa `last_step` e continua depois da última etapa concluída.
Assim um erro no vídeo, por exemplo, não reenvia o áudio e o link que já chegaram.

## Relação com Agent V3
Agent V3 fica bloqueado enquanto o run estiver:
- running
- paused
- failed

A IA somente assume depois de `completed`.

## Falhas
Falhas não são mais deletadas do banco.
São mantidas com:
- error_message
- last_error_at
- last_step
- retry_count
- timeline de eventos

## Pausa
A pausa é cooperativa: se uma requisição à Uazapi já estiver em andamento, ela termina.
Antes da próxima etapa (e depois de delays), o runner consulta o status e interrompe ao ver `paused`.

## Migration obrigatória
`20260728022000_funnel_control_center.sql`
- adiciona status `paused`
- metadados de retry/pause
- tabela `welcome_funnel_run_events`
