import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, MessageSquare, DollarSign, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const stats = [
    { label: "Mensagens (Hoje)", value: "1.240", icon: MessageSquare, color: "text-blue-500" },
    { label: "Custo Estimado", value: "$1.08", icon: DollarSign, color: "text-green-500" },
    { label: "Latência Média", value: "1.2s", icon: Zap, color: "text-yellow-500" },
    { label: "Uptime Agente", value: "99.9%", icon: Activity, color: "text-purple-500" },
  ];

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard do Agente</h1>
        <p className="text-muted-foreground">Métricas de performance e monitoramento em tempo real.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="bg-card/50 backdrop-blur-sm border-white/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card/50 backdrop-blur-sm border-white/5">
          <CardHeader>
            <CardTitle className="text-lg">Estado do Runtime</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Versão Ativa</span>
              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">V3 PRODUCTION</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Modelo Principal</span>
              <span className="text-sm font-mono text-white">claude-haiku-4-5</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Prompt Caching</span>
              <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">ENABLED</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-white/5">
          <CardHeader>
            <CardTitle className="text-lg">Inteligência de Lead</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Prob. Conversão Média</span>
              <span className="text-sm font-bold text-white">78%</span>
            </div>
            <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full w-[78%]" />
            </div>
            <p className="text-xs text-muted-foreground italic">
              Baseado nas últimas 50 interações analisadas pelo extrator V3.
            </p>
          </CardContent>
        </Card>
      </div>
      
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-sm text-red-500 leading-relaxed whitespace-pre-wrap mb-4">
        URGENTE — Falha ao salvar resposta do agente
        Erro atual no Agent Playground: "Falha ao salvar resposta do agente"
        Isso indica que a geração da resposta pode estar funcionando, mas a persistência no banco está falhando.
        Não criar novas funcionalidades agora.
        Investigar exatamente a operação de salvamento após runAgentV3Turn().

        FLUXO A VERIFICAR
        mensagem do usuário → runAgentV3Turn() → resposta do Claude → saveConversationStateV3 / insert da mensagem do agente → falha

        1. CAPTURAR ERRO REAL DO BANCO
        Executar no Playground: "Bom dia"
        Mostrar:
        - mensagem original do Supabase/Postgres;
        - error code;
        - error details;
        - error hint;
        - tabela;
        - coluna;
        - payload enviado;
        - stack trace;
        - arquivo e linha.
        Não retornar somente: "Falha ao salvar resposta do agente".

        2. VERIFICAR ALTERAÇÕES RECENTES
        Comparar o payload de salvamento antes e depois da implementação de:
        - telemetria por módulo;
        - module_keys;
        - module_versions;
        - module_chars;
        - estimated_tokens_by_module;
        - module_impact;
        - prompt comparison;
        - Lead Intelligence;
        - metadata comercial.
        Verificar se algum campo novo está sendo enviado para uma coluna inexistente ou com tipo incompatível.

        3. VALIDAR SCHEMA
        Inspecionar a tabela usada para persistir mensagens e histórico, incluindo:
        - conversations_v3;
        - agent_playground_runs;
        - tabela de mensagens, se separada.
        Validar:
        - colunas existentes;
        - tipos;
        - campos obrigatórios;
        - defaults;
        - constraints;
        - foreign keys;
        - unique constraints;
        - RLS.

        4. VALIDAR PAYLOAD
        Antes do insert/update, registrar de forma segura:
        - workspace_id;
        - conversation_id;
        - session_id;
        - message_id;
        - role;
        - content;
        - metadata;
        - created_at.
        Garantir:
        - content sempre string;
        - role com valor permitido;
        - metadata serializável;
        - nenhum undefined;
        - nenhum BigInt;
        - nenhum Date não serializado;
        - nenhum campo circular;
        - nenhum NaN ou Infinity.

        5. SUSPEITA PRINCIPAL
        A telemetria de impacto por módulo foi implementada imediatamente antes da falha.
        Verificar especialmente se os novos objetos estão sendo salvos em metadata JSONB.
        Normalizar antes de salvar:
        JSON.parse(JSON.stringify(metadata))
        ou função equivalente segura.
        Não enviar campos extras diretamente para a tabela caso não existam como colunas.

        6. TRATAMENTO CORRETO
        A resposta do agente não deve ser perdida se apenas uma telemetria opcional falhar.
        Separar:
        A) salvamento obrigatório:
        - mensagem;
        - role;
        - conversa;
        - timestamps.
        B) telemetria opcional:
        - impacto dos módulos;
        - tokens por módulo;
        - comparativos;
        - scores.
        Se a telemetria falhar:
        - salvar a mensagem normalmente;
        - registrar telemetry_save_failed;
        - não derrubar a conversa.

        7. TESTES OBRIGATÓRIOS
        Teste 1: Playground: "Bom dia"
        Esperado:
        - resposta gerada;
        - resposta salva;
        - histórico atualizado.
        Teste 2: Playground: "Quero comprar plays"
        Esperado:
        - módulos comerciais carregados;
        - resposta salva;
        - metadata salva.
        Teste 3: WhatsApp texto: "Bom dia"
        Teste 4: WhatsApp áudio: "Quero comprar plays"
        Em todos, informar:
        - geração: sucesso/falha;
        - persistência da mensagem: sucesso/falha;
        - persistência da telemetria: sucesso/falha.

        8. ROLLBACK
        Se a causa for a telemetria recém-adicionada:
        - reverter somente a persistência dos campos novos;
        - manter a geração do agente funcionando;
        - depois corrigir o schema ou salvar esses dados somente em agent_playground_runs.
        Entregar:
        - causa raiz;
        - erro SQL completo;
        - arquivo corrigido;
        - migration criada, se necessária;
        - testes executados.
      </div>
    </div>
  );
}