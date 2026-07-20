import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-bold">Melhorar o Lead Intelligence do Agent Playground</CardTitle>
            <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
              V3 Specification
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm font-mono">
          <div className="bg-muted p-4 rounded-md overflow-x-auto whitespace-pre-wrap">
            {`Quero evoluir o painel de classificação do Agent Playground para que ele deixe de usar regras simples e passe a representar o estado real da conversa.

Hoje aparecem:
Temperatura
Intenção
Estágio

Porém a classificação atual é muito agressiva.
Exemplo incorreto:
Cliente: Boa noite
Resultado atual: Temperatura: QUENTE | Intenção: Compra | Estágio: Fechamento
Esse resultado não representa a realidade.

Objetivo
Criar uma camada chamada: Lead Intelligence
Ela será usada apenas para análise e inspeção do agente.
Ela não deve alterar a resposta enviada ao cliente.
Ela serve para entender o comportamento da conversa.

Nova classificação
Substituir o painel atual por: Lead Intelligence

Temperatura
Frio | Morno | Quente

Confiança
Muito baixa | Baixa | Média | Alta | Muito alta

Intenção
Saudação | Informação | Pesquisa | Comparação | Compra | Suporte | Pagamento | Pós-venda | Reclamação | Outro

Estágio
Primeiro contato | Descoberta | Qualificação | Negociação | Objeções | Fechamento | Pós-venda

Probabilidade de compra
0–100%

Sentimento
Positivo | Neutro | Negativo

Urgência
Baixa | Média | Alta

Próxima ação recomendada
...

Regras de Temperatura
Não utilizar apenas palavras-chave. Considerar histórico completo.
Exemplos:
FRIO: Boa noite, Oi, Olá, Tudo bem?, Quero conhecer vocês, Como funciona?
MORNO: Quanto custa?, Tem garantia?, É seguro?, Entrega em quanto tempo?, Como compro?
QUENTE: Quero comprar, Pode me mandar o Pix, Vou fazer agora, Já escolhi, Me passa o site, Vou fechar

Intenção
Detectar a intenção principal.
Exemplos:
Boa noite ↓ Saudação
Como funciona? ↓ Informação
Qual valor? ↓ Pesquisa
Instagram ou TikTok? ↓ Comparação
Quero comprar ↓ Compra
Meu pedido caiu ↓ Suporte

Estágio
Criar regras reais.
Primeiro contato ↓ Ainda não conhece a empresa.
Descoberta ↓ Está fazendo perguntas.
Qualificação ↓ Já informou a rede.
Negociação ↓ Pergunta preço.
Objeções ↓ Tem medo. Pergunta se é golpe. Pergunta garantia.
Fechamento ↓ Pediu Pix. Quer comprar. Solicitou link.
Pós-venda ↓ Já comprou.

Confiança
Criar indicador separado.
Exemplos.
Muito baixa ↓ "Isso é golpe?"
Baixa ↓ "Nunca ouvi falar."
Média ↓ "Como funciona?"
Alta ↓ "Vou comprar."
Muito alta ↓ "Já comprei antes."

Probabilidade de compra
Criar score: 0–100%
Baseado em: estágio, temperatura, confiança, intenção, histórico.
Exemplos:
Boa noite ↓ 8%
Quanto custa? ↓ 42%
Me manda o Pix ↓ 98%

Próxima ação recomendada
Gerar automaticamente.
Exemplos.
Cliente frio ↓ Apresentar empresa
Cliente pesquisando ↓ Explicar benefícios
Cliente negociando ↓ Mostrar preço
Cliente quente ↓ Enviar link do painel

Justificativa
Adicionar uma aba: Por que?
Mostrar:
Temperatura ↓ Morno (Porque o cliente perguntou preço mas ainda não pediu para comprar).
Estágio ↓ Descoberta (Porque ainda não houve negociação).

Timeline
Adicionar uma timeline.
20:10 FRIO ↓ 20:12 MORNO ↓ 20:15 QUENTE
Assim será possível visualizar a evolução do lead durante a conversa.

Gráfico
Adicionar gráfico: Temperatura ██████ | Compra ██████████ ou linha temporal mostrando a evolução.

Histórico de mudanças
Registrar todas as alterações. Exemplo: Mensagem 1 (Frio) -> Mensagem 3 (Morno) -> Mensagem 6 (Quente).

Separação da IA
Essa classificação não pode alterar o comportamento da Júlia.
Ela serve apenas para: debugging, métricas, analytics, treinamento, melhoria do agente.
Nunca deve ser usada para modificar a resposta automaticamente.

Persistência
Salvar por execução.
Campos: temperature, confidence, intent, stage, purchase_probability, sentiment, urgency, recommended_action, reasoning.

Critério de aceite
Para uma conversa nova: "Boa noite"
Resultado esperado: Temperatura Frio, Confiança Muito baixa, Intenção Saudação, Estágio Primeiro contato, Probabilidade 5%, Sentimento Neutro, Urgência Baixa.
Próxima ação: Apresentar a empresa e descobrir a necessidade do cliente.

Para: "Quero comprar plays"
Resultado esperado: Temperatura Quente, Confiança Média, Intenção Compra, Estágio Negociação, Probabilidade 85%.
Próxima ação: Confirmar a plataforma e encaminhar para o fechamento.

Minha recomendação extra
Eu faria mais uma melhoria: adicionar um "Conversation Score" (0 a 100) para avaliar a qualidade do atendimento da Júlia.
Esse score seria composto por métricas como: Humanidade da resposta, Objetividade, Clareza, Potencial de conversão, Consistência com a persona, Uso correto dos módulos, Tamanho adequado da resposta, Número de perguntas por mensagem, Tempo de resposta, Custo da execução.

No final de cada teste, o Playground mostraria algo como:
Conversation Score: 94/100
✔ Persona consistente
✔ Tom humano
✔ Resposta objetiva
✔ Módulos corretos
✔ Baixo custo
⚠ Perguntou duas coisas ao mesmo tempo

Essa ferramenta acelera muito a evolução do agente, porque você deixa de avaliar apenas "na sensação" e passa a ter indicadores consistentes para comparar versões da IA.`}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

