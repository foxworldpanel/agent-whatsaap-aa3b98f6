# Checkpoint — Conversas Inbox V2

Base: versão (65) enviada pelo usuário.

Melhorias de interface:
- remove combinação visual de telefone + IDs/códigos internos;
- formata telefone BR quando disponível;
- IDs WhatsApp/LID não são apresentados como telefone;
- nome real aparece como principal e telefone como secundário;
- avatar possui fallback real para iniciais quando URL expira/quebra;
- filtros rápidos: Todos, Humano, Meta Ads, Quentes;
- Lead Intelligence vazio vira uma barra compacta;
- busca também reconhece telefone formatado.

Melhorias de sincronização:
- botão Sincronizar faz backfill de até 150 fotos ausentes por execução;
- contatos antigos podem receber foto sem depender de uma nova mensagem;
- /chat/find evita tratar @lid como número telefônico;
- tenta campos explícitos de telefone antes do chat id.

Observação:
se a Uazapi não fornecer nenhum telefone real para um chat @lid, a interface mostra
"Telefone não identificado" em vez de expor o identificador interno.
