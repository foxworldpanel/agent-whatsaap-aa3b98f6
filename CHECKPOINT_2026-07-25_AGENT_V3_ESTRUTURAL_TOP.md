# Checkpoint — Agent V3 estrutural

Base: ZIP (78) enviado pelo usuário.

## Evolução aplicada

### 1. Estado comercial persistente
Novo `conversation_business_state_v3`:
- novo_lead
- descoberta
- orcamento
- fechamento
- pagamento
- compra_bloqueada
- pedido_realizado
- pos_venda
- reclamacao
- adiado
- abandono
- aguardando_setor

Também persiste risco, motivo e próxima ação.

### 2. Decisão de negócio antes do Claude
`deriveBusinessDecisionV3` roda antes do LLM e produz:
- estado;
- nível de risco;
- motivo;
- ação permitida;
- se pode voltar a qualificar;
- se deveria haver handoff.

A decisão é enviada ao prompt como contexto autoritativo.

### 3. Camada central de verdades da Mind
Arquivo `operational-truth.server.ts`, sempre carregado:
- cadastro = e-mail + senha;
- sem reconhecimento facial/documento;
- pagamento via painel;
- bancos/recebedores Pix podem variar;
- comprovante não é validado por recebedor;
- pedido é criado pelo cliente;
- Júlia não promete criar pedido manual;
- preços/prazos/garantias somente dos módulos.

### 4. Menu Conversas
Passa a mostrar:
- Estado da conversa;
- Risco;
- Motivo;
- Próxima ação recomendada;
- Lead Intelligence.

Filtros novos:
- Setor;
- Pagamento;
- Venda bloqueada;
- Reclamações;
- Meta Ads;
- Quentes.

Ao copiar a conversa, o Estado da Conversa vai junto.

### 5. Regressão com casos reais
Testes novos cobrem:
- pedido explícito de humano;
- venda bloqueada;
- tentativa técnica única;
- pedido concluído;
- adiamento;
- abandono;
- retomada após erro antigo;
- orçamento/preço.

## Observação de deploy
A nova tabela exige aplicar a migration
`20260725232500_conversation_business_state_v3.sql`.
Se ela ainda não tiver sido aplicada, o atendimento continua funcionando e apenas
a persistência/visualização do novo estado fica indisponível até a migration entrar.
