-- Corrige/reforça a instrução de como adicionar saldo no painel: o botão
-- correto se chama "Depositar" (não "Recarga" nem "Saldo" genericamente).
-- Um cliente real ficou preso ~50 minutos porque o agente deu uma instrução
-- vaga demais para achar o botão certo.
UPDATE public.agent_modules_v3
SET content = content || E'\n\nCORREÇÃO — BOTÃO DE SALDO:\nO botão certo pra adicionar saldo no painel se chama exatamente "Depositar" (não "Recarga" nem "Saldo"). Fluxo exato: entra no painel → clica em "Depositar" → gera o Pix → paga → o saldo entra na conta (pode levar alguns minutos pra atualizar).',
    updated_at = now()
WHERE workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa'
  AND key = 'como_usar_painel'
  AND content NOT LIKE '%CORREÇÃO — BOTÃO DE SALDO%';
