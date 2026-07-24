# Checkpoint — repetição do funil para número de teste

Regra final:
- clientes normais: cada funil continua disparando apenas uma vez por contato;
- número 5511970116430: pode repetir o mesmo funil sempre que enviar novamente o gatilho;
- a exceção vale somente para o funil, não altera bloqueios, opt-out nem regras do Agent V3;
- o reset ocorre automaticamente quando existe um run `completed` para esse número.

Isso permite testar repetidamente o gatilho sem limpar `welcome_funnel_runs` manualmente.
