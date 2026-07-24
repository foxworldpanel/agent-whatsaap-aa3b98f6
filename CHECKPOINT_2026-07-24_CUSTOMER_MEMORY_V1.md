# Checkpoint — Customer Memory V1

Base: versão (67).

## Estado comercial persistente
Novo ciclo:
- novo_lead
- interessado
- negociacao
- pronto_para_comprar
- cliente
- cliente_recorrente

Ao detectar uma confirmação real de compra:
- contato vira `perfil=ativo`;
- `temperatura=cliente`;
- conversa vira `status=convertido`;
- memória registra data de conversão, compras, plataforma, produto e próxima oportunidade;
- próximos turnos são tratados como pós-venda;
- cliente convertido não volta automaticamente para frio/qualificação.

## Resiliência
A tabela nova `customer_commercial_memory` possui migration própria.
Se ela ainda não existir, o runtime não quebra: usa `contacts.perfil` e
`contacts.temperatura` como fallback persistente.

## Funil
Cliente conhecido/convertido não recebe novamente o funil inicial.
O número 5511970116430 continua sendo exceção de teste.

## Conversa
Reações simples como 👍, 🤝 e ❤️ ficam registradas no CRM, mas não geram resposta
automática desnecessária.

## Inbox
Cliente convertido ganha banner com:
- número de compras;
- potencial de recompra;
- próxima oportunidade, quando registrada.
