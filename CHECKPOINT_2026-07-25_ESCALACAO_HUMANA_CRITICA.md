# Checkpoint — reclamação crítica -> revisão humana

Base: versão (76) enviada pelo usuário.

## Regra nova
Antes de chamar o Claude, o webhook analisa a mensagem atual + até 20 mensagens recentes
do cliente.

Escala automaticamente quando encontra, por exemplo:
- denúncia / Procon / advogado / processo / justiça / contestação;
- problema de pedido/conta + suporte inacessível;
- reclamação não resolvida + perda grave/bloqueio;
- cliente sem canal funcional para suporte.

## Ao escalar
- envia UMA mensagem curta de transição;
- `agent_enabled = false`;
- `needs_review = true`;
- registra `review_reason`;
- grava nota interna;
- limpa a memória operacional V3;
- encerra o turno antes do Claude;
- próximas mensagens ficam para o humano até reativação manual.

## Lead Intelligence
O handoff grava:
- Temperatura: frio
- Confiança: Muito alta
- Intenção: Reclamação
- Estágio: Pós-venda
- Probabilidade de Compra: 20%
- Sentimento: Negativo
- Urgência: Alta

Também foi corrigido o fallback do orchestrator caso uma reclamação crítica chegue até ele.

## Ajuste de comunicação ao cliente
A mensagem externa de handoff não menciona IA, robô, automação ou "revisão humana".
Texto atual:
"Entendi. Como seu caso precisa de uma análise mais detalhada, vou pausar por aqui e encaminhar para o setor responsável. Assim que possível, a equipe dará continuidade ao seu atendimento."

Internamente, `agent_enabled=false` e `needs_review=true` continuam funcionando normalmente.
