# Correção — Temperatura CRM automática

Problema:
A caixa Frio / Morno / Quente / Cliente / Bloqueado do menu Conversas lia
`contacts.temperatura`, porém o Agent V3 atualizava principalmente o Lead Intelligence.
Na prática, muitos contatos continuavam como Frio mesmo depois de avançarem na compra.

Correção:
- sincronização automática da temperatura após cada turno do Agent V3;
- usa Business State + Lead Intelligence + probabilidade + memória comercial;
- orçamento -> pelo menos Morno;
- fechamento/pagamento/compra bloqueada -> Quente;
- compra confirmada/pós-venda -> Cliente;
- plataforma + produto já conhecidos -> pelo menos Morno;
- Frio/Morno/Quente não regridem automaticamente por uma única mensagem;
- Cliente não regride;
- Bloqueado nunca é sobrescrito automaticamente.

A caixa no topo das Conversas continua permitindo ajuste manual.
