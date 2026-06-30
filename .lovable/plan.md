# Proteções de segurança no Disparo

## 1. Aquecimento progressivo
- Migração: adiciona em `whatsapp_numbers` os campos `warmup_started_at` (timestamptz) e `warmup_enabled` (bool, default true).
- No `blast-dispatcher.ts`, antes de cada envio, calcula `dias_ativos = floor((now - warmup_started_at)/1 dia) + 1` quando `warmup_enabled = true`.
  - Dia 1: 50 / Dia 2: 100 / Dia 3: 150 / Dia ≥4: `daily_limit` configurado.
- Ao primeiro envio bem-sucedido em um número, grava `warmup_started_at = now()` se nulo.
- UI: em `disparos.tsx` no `NumbersCard` (recém criado) mostra "Aquecimento: Dia X — limite hoje: N" com toggle de habilitar/desabilitar.

## 2. Distribuição natural de horário
- No dispatcher (roda a cada minuto), além do delay aleatório, aplica peso por faixa horária:
  - 10–12h e 18–20h → peso 3 (maior chance de disparar)
  - resto da janela → peso 1
- Implementação: ao decidir pular o tick, sortea `Math.random() < peso/3`. Mantém `daily_limit` como teto.

## 3. Testar com meu número
- Server fn `testBlastCampaign({ campaignId, phone })` em `src/lib/blast.functions.ts`:
  - valida phone (10–13 dígitos), substitui `{nome}` por "Teste" e `{instagram}` por "@teste".
  - chama `uazapiSendText` direto pelo número da campanha. Não grava em `blast_contacts` nem `blast_logs` (apenas console log).
- UI: input + botão "Testar com meu número" no card da campanha.

## 4. Confirmação dupla ≥100 contatos
- No handler de "Iniciar" da UI, se `pendingContacts >= 100` abre `AlertDialog` com texto:
  - X contatos, estimativa Y dias = `ceil(X / dailyLimitEfetivo)`.
- Só chama `setBlastCampaignState({ state: 'rodando' })` após confirmar.

## 5. Validação ao importar CSV
- Em `importBlastContacts` (server fn): normaliza `telefone` (só dígitos), valida 10–13 chars, deduplica por telefone dentro do lote E contra `blast_contacts` existentes da campanha.
- Cross-check em `contacts`: descarta telefones cujo `status in ('cliente','bloqueado')`.
- Retorna `{ imported, removed: { duplicates, invalid, blocked } }`. UI exibe resumo via toast.

## 6. Monitor de saúde do número
- Migração: tabela `number_health` (opcional) ou colunas em `whatsapp_numbers`: `auto_pause_on_risk` (bool), `last_risk_check_at`, `risk_level` (text: ok|warning|danger).
- `blast_logs` já registra `status='failed'`. Server fn `getNumberHealth({ numberId })`:
  - calcula taxa de falha das últimas 24h: `failed / (sent + failed)`.
  - se ≥15% → `warning`; ≥30% → `danger`.
  - opcionalmente chama `uazapiStatus` para checar conexão.
- UI: card "Saúde do número" no `NumbersCard` com taxa de falha, banner vermelho se `danger`, toggle "Pausar automaticamente se detectar risco".
- Dispatcher: se `auto_pause_on_risk = true` e `risk_level = 'danger'`, seta todas as campanhas `rodando` desse número para `pausado` e registra `blast_logs` com `error='auto_paused_risk'`.

## Arquivos
- **Migração**: novos campos em `whatsapp_numbers` (warmup_started_at, warmup_enabled, auto_pause_on_risk, risk_level, last_risk_check_at).
- **Editar**: `src/lib/blast.functions.ts` (validação CSV, `testBlastCampaign`, `getNumberHealth`), `src/routes/api/public/hooks/blast-dispatcher.ts` (aquecimento, peso horário, auto-pause), `src/routes/_authenticated/disparos.tsx` (UI: teste, confirmação, saúde, aquecimento).

Confirma para eu implementar?
