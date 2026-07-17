import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: DecommissioningLanding,
});

function DecommissioningLanding() {
  return (
    <div className="p-8 font-mono whitespace-pre-wrap max-w-4xl mx-auto">
      AUDITORIA COMPLETA DA ARQUITETURA DE IA - RUNTIME V2
Objetivo:
Não corrigir bugs.
Não alterar código.
Auditar toda a estratégia de utilização dos modelos de IA para garantir:
- melhor qualidade de atendimento;
- menor custo operacional;
- menor latência;
- máxima escalabilidade.

==================================================
1. INVENTÁRIO DAS IAS
==================================================
Listar todas as integrações atualmente utilizadas.
Para cada uma informar:
- provider;
- finalidade;
- arquivos;
- funções;
- endpoint;
- variável de ambiente;
- quando é utilizada;
- quem a chama.

Exemplo:
Anthropic
OpenAI
ElevenLabs
Whisper
Vision
OCR
Embeddings
Outras.

==================================================
2. FLUXO COMPLETO
==================================================
Desenhar o fluxo de uma conversa.
Mensagem recebida
↓
Classificação
↓
Seleção de módulos
↓
Construção do prompt
↓
Escolha do modelo
↓
Resposta
↓
Persistência
↓
Áudio (quando existir)
↓
Analytics

Mostrar exatamente onde cada IA entra.

==================================================
3. ESTRATÉGIA DE MODELOS
==================================================
Responder:
Quando usamos: Claude Haiku 4.5
Quando usamos: Claude Sonnet 5
Existe escalonamento automático?
Ou tudo vai para o mesmo modelo?
Existe fallback?
Como funciona?

==================================================
4. ANÁLISE DE CUSTO
==================================================
Simular 1000 atendimentos.
Separar:
95% simples
5% complexos
Comparar:
A) Tudo Sonnet
B) Tudo Haiku
C) Haiku + Sonnet inteligente

Mostrar:
custo
latência
qualidade
recomendação.

==================================================
5. ÁUDIO
==================================================
Auditar:
transcrição
síntese

Responder:
OpenAI continua sendo usada? Whisper? Outro provider?
ElevenLabs continua sendo utilizada? Em quais situações? Vale manter?

==================================================
6. IMAGENS
==================================================
Quando chega imagem:
quem analisa? Haiku? Sonnet? Vision? Outro provider?
Justificar.

==================================================
7. CHAMADAS DUPLAS
==================================================
Verificar se existem duas chamadas para IA na mesma mensagem.
Exemplo:
Haiku ↓ Sonnet ↓ Haiku novamente ↓ Analytics
Eliminar desperdícios.

==================================================
8. PROMPTS
==================================================
Medir:
tokens médios
tokens do system
tokens dos módulos
tokens do histórico
tokens da resposta

Identificar desperdícios.

==================================================
9. HISTÓRICO
==================================================
Quantas mensagens anteriores são enviadas?
Existe limite?
Resumo automático?
Compressão?
Janela inteligente?

==================================================
10. CLASSIFICADOR
==================================================
O roteador escolhe:
Haiku
Sonnet
ou ambos?

Essa decisão é baseada em:
texto
imagem
áudio
complexidade
módulos
ou regras fixas?

==================================================
11. RECOMENDAÇÃO FINAL
==================================================
Apresentar a arquitetura ideal.

Exemplo esperado:
Mensagens comuns: → Claude Haiku 4.5
Mensagens com imagem: → Claude Sonnet 5
Análises complexas: → Claude Sonnet 5
Transcrição: → OpenAI Whisper
Áudio: → ElevenLabs

Nunca usar Sonnet para perguntas simples.
Nunca analisar imagem com Haiku.
Nunca chamar dois LLMs quando um resolve.

==================================================
FINALIZAR COM
ARQUITETURA ATUAL:
ARQUITETURA RECOMENDADA:
CUSTO ESTIMADO:
ECONOMIA ESTIMADA:
LATÊNCIA MÉDIA:
CHAMADAS DUPLAS ENCONTRADAS:
MODELOS DESNECESSÁRIOS:
MODELOS SUBUTILIZADOS:
MELHOR ESTRATÉGIA PARA PRODUÇÃO:
    </div>
  );
}
