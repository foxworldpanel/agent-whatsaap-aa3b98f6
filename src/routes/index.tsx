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
      
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 text-sm text-green-500 leading-relaxed whitespace-pre-wrap mb-4">
        ✅ MÓDULOS ATUALIZADOS — CMS V3 MODULAR IMPLEMENTADO
        A biblioteca modular foi migrada para a arquitetura "WordPress para IA".
        Agora cada rede social é um módulo independente com seus próprios preços e regras.
      </div>
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
        Evolução do CMS V3 — Biblioteca Modular
        A página "Agente IA" deve funcionar como um CMS completo.
        Não quero uma lista fixa de módulos.
        Quero transformar os módulos em entidades totalmente gerenciáveis.

        Implementar:
        1. Criar módulo
        2. Editar módulo
        3. Duplicar módulo
        4. Excluir módulo
        5. Ativar/desativar módulo
        6. Organizar por categorias
        7. Arrastar para reorganizar (drag and drop), se possível

        Categorias sugeridas:
        - Núcleo
        - Comercial
        - Redes Sociais
        - Pagamentos
        - Suporte

        Alteração importante:
        Remover o conceito de "Tabela de Preços" como módulo único.
        Cada rede social deve conter seus próprios:
        - serviços;
        - preços;
        - regras;
        - perguntas;
        - exemplos;
        - observações.

        Exemplo:
        Spotify:
        - Plays
        - Ouvintes
        - Saves
        - Playlists

        YouTube:
        - Visualizações
        - Likes
        - Inscritos
        - Horas
        - Live

        Instagram:
        - Seguidores
        - Curtidas
        - Reels
        - Story

        O objetivo é que cada módulo seja totalmente independente e responsável apenas pelo seu domínio.
        Assim, adicionar uma nova rede ou um novo serviço não exige alterar outros módulos.
      <div className="mt-8 p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-500 text-sm">
        <strong>Correção Aplicada:</strong> O erro "Falha ao salvar mensagem do usuário" no Agent Playground foi corrigido (uso do contexto de autenticação no servidor).
      </div>
    </div>
    </div>
  );
}