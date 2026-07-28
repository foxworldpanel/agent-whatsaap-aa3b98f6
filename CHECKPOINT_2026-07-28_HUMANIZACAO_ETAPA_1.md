# Humanização — Etapa 1

Aplicado na versão 87:

- limite central do Agent V3 alterado para 250 caracteres;
- respostas acima do limite são divididas em 2 ou 3 mensagens naturais;
- preservação de separadores explícitos, incluindo URL isolada do painel;
- prompt reforçado para respostas comuns de 80–180 caracteres;
- explicações de 180–250 caracteres;
- proibição de textões e linguagem de documentação;
- proibição de solicitar links por iniciativa própria;
- proibição de afirmar que abriu, analisou, conferiu ou verificou links, perfis, músicas ou contas;
- testes de regressão adicionados em `tests/humanization-stage1.test.ts`.
