# Auditoria final Agent V3 — 27/07/2026

Base auditada: ZIP (81).

## Corrigido e validado
- Funil: gatilho normalizado, mas saudações genéricas não disparam sozinhas.
- Funil: cliente falando durante a sequência não cancela áudio/link/vídeo/tabela.
- Funil: Agent V3 fica bloqueado enquanto status=running e só entra após completed.
- Funil: uma vez por contato, exceto número de teste configurado.
- Removida lógica antiga/morta de cancelamento do funil para não haver duas regras contraditórias.
- Lead Intelligence: fechamento, pagamento, pós-venda e recompra têm precedência sobre fallback frio/20%.
- Pós-venda: não volta para qualificação quando já há compra confirmada.
- Continuidade: após funil/Júlia apresentada, não se apresenta novamente.
- Contexto: frases ambíguas como “o que está no seu comercial?” devem ser interpretadas pelo contexto comercial.
- Áudio: erro provável de transcrição deve usar contexto antes de mudar de assunto.
- Respostas: padrão curto de WhatsApp, 15–35 palavras, uma pergunta no máximo.
- Reações/ack curtos (emoji, ok, blz, beleza, entendi, certo) podem ficar sem resposta.
- Tabelas: pedido de tabela/valores gera uma única mensagem limpa.
- Tabelas: regra vale para todas as plataformas; tabela é montada dos módulos autoritativos.
- Spotify: tabela inclui Seguidores, Plays + Ouvintes, Saves e 1 Música em 10 Playlists.
- Cadastro: bloqueio determinístico contra reconhecimento facial/biometria/documentos inventados.
- Comprovante: não rejeitar por banco/recebedor/razão social.
- Banco “alto risco”: não dizer que é comum nem inventar causa técnica.
- Handoff humano: pausa o agente e fala “setor responsável”, sem expor revisão por IA.

## Duplicidade/contradição
- Nenhum bullet duplicado no bloco principal de regras do orchestrator.
- Testes antigos que exigiam cancelamento do funil foram atualizados para a arquitetura atual.
- As migrations de estado do funil usam IF NOT EXISTS; foram mantidas por segurança de histórico de deploy.

## Observação operacional
Falhas externas (UAZAPI, Supabase, Anthropic, OpenAI/Whisper, ElevenLabs ou mídia indisponível) ainda podem ocorrer. O runtime possui fail-open/retry/telemetria onde aplicável; não existe garantia técnica de 100% de disponibilidade externa.
