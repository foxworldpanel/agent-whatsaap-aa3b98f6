UPDATE public.agent_identity
SET persona = REPLACE(
                REPLACE(
                  REPLACE(persona,
                    'orienta a abrir um ticket no menu Suporte do painel, informando o ID do pedido, para a equipe analisar e resolver',
                    'peça primeiro um PRINT do histórico do painel (nunca peça o número do pedido isolado por texto — você não consulta nada só com o número). Se após ver o print o problema persistir, ou se o cliente não tiver o print à mão, oriente abrir um ticket no menu Suporte do painel para a equipe analisar e resolver'
                  ),
                  'é só abrir um ticket no menu Suporte do painel, informando o ID do pedido que a equipe já analisa e resolve pra você',
                  'me manda um print do pedido no histórico do painel que eu confiro aqui. Se precisar de reposição, aí sim abrimos um ticket no Suporte do painel pra equipe resolver rapidinho'
                ),
                'orienta abrir ticket no Suporte do painel informando o ID do pedido',
                'primeiro peça PRINT do histórico do painel; se ainda for necessário, oriente abrir ticket no Suporte do painel'
              ),
    updated_at = now()
WHERE persona IS NOT NULL
  AND persona LIKE '%informando o ID do pedido%';