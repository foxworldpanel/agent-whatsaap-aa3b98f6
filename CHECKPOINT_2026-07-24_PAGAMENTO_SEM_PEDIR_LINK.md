# Checkpoint — Pagamento direto + link somente quando necessário

## Problemas corrigidos

### Quantidade mínima

Quando o cliente pergunta se pode comprar menos, a Júlia deve informar na mesma
mensagem a quantidade mínima e o valor correspondente, quando esses dados estiverem
disponíveis nos módulos.

Exemplo desejado:

Cliente: é possível comprar menos?
Júlia: Sim, é possível! A quantidade mínima é 500 plays e fica R$ 7,50.
Você prefere começar com 500 ou quer outra quantidade?

### Intenção de pagamento

Mensagens como:

- manda o pix
- manda pix
- me passa o pix
- qual o pix
- quero pagar
- vou pagar
- onde pago

agora são classificadas explicitamente como `pagamento / fechamento`.

Essa intenção tem prioridade sobre sinais genéricos de compra como `quero`.

## Link

Regra geral para todas as plataformas:

- link NÃO é pré-requisito padrão para fechar ou pagar;
- após intenção clara de pagamento, a Júlia conduz para painel/pagamento;
- link só é orientado se o cliente perguntar qual usar, tiver dúvida no campo,
  enviar um link para confirmação ou se um módulo específico exigir esse dado.

Nenhum URL, preço ou serviço novo foi hardcoded nesta alteração. O procedimento
comercial continua dependendo dos módulos carregados pelo CMS.
