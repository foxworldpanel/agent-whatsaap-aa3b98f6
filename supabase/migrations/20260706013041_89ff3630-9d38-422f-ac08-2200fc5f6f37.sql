UPDATE public.agent_config
SET modules = jsonb_set(
  modules,
  '{spotify}',
  to_jsonb(
    (modules->>'spotify') || E'\n\n' ||
    E'GANHO DIÁRIO DE PLAYS (quando o cliente perguntar "quantos plays por dia", "quanto rende", "quanto ganho por dia"):\n' ||
    E'O ganho é ORGÂNICO. A estimativa é de 50 a 150 plays por dia, POR PLAYLIST. Como o pacote tem 10 playlists rodando ao mesmo tempo, o resultado se soma.\n\n' ||
    E'Exemplo de resposta:\n' ||
    E'"É orgânico, então varia, mas a média é de 50 a 150 plays por dia em cada playlist. Como são 10 playlists no pacote, o resultado se soma — isso ao longo dos 30 dias vai dando um bom alcance pra música."\n\n' ||
    E'REGRA CRÍTICA: NUNCA prometa um número fixo/exato de plays totais. NUNCA garanta número absoluto. O resultado é estimado, orgânico e varia por playlist/gênero/momento. SEMPRE comunique como FAIXA (50 a 150 por playlist/dia), nunca como garantia.'
  ),
  true
)
WHERE modules ? 'spotify'
  AND (modules->>'spotify') NOT LIKE '%GANHO DIÁRIO DE PLAYS%';