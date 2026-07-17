import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, ListFilter, Trash2, Database, ShieldCheck, ArrowRight, Clock, Rocket, Search, LayoutGrid, ClipboardList } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: DecommissioningLanding,
});

function DecommissioningLanding() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redireciona para o dashboard caso não queira ver a página de descomissionamento
    // navigate({ to: "/conversas" });
  }, [navigate]);

  const phases = [
    { id: 1, title: "Backup e Ponto de Restauração", status: "Concluído", progress: 100, icon: Clock, color: "text-blue-500" },
    { id: 2, title: "Inventário de Dependências", status: "Em andamento", progress: 60, icon: Search, color: "text-orange-500" },
    { id: 3, title: "Migração de Compartilhados", status: "Iniciado", progress: 10, icon: Rocket, color: "text-purple-500" },
    { id: 4, title: "Remoção do Runtime V1", status: "Pendente", progress: 0, icon: ShieldCheck, color: "text-red-500" },
    { id: 5, title: "Remoção do Código Legado", status: "Pendente", progress: 0, icon: Trash2, color: "text-red-500" },
    { id: 6, title: "Banco de Dados (Deprecating)", status: "Pendente", progress: 0, icon: Database, color: "text-yellow-600" },
    { id: 7, title: "Secrets e Chaves", status: "Pendente", progress: 0, icon: ShieldCheck, color: "text-green-600" },
    { id: 8, title: "Interface e UI", status: "Pendente", progress: 0, icon: LayoutGrid, color: "text-indigo-500" },
    { id: 9, title: "Testes Obrigatórios", status: "Pendente", progress: 0, icon: CheckCircle2, color: "text-emerald-500" },
    { id: 10, title: "Evidências Finais", status: "Pendente", progress: 0, icon: ListFilter, color: "text-slate-500" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-red-100 p-2 text-red-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Descomissionamento Definitivo: Arquitetura V1
            </h1>
          </div>
          <p className="max-w-3xl text-lg text-slate-600 leading-relaxed">
            A Agente Mind agora utiliza exclusivamente a <strong>Runtime V2</strong>. Este painel monitora a limpeza, 
            estabilidade e segurança do sistema durante a remoção completa do legado V1.
          </p>
          <div className="flex items-center gap-4 border-t pt-4">
            <Link to="/conversas">
              <Button size="lg" className="font-bold">
                Acessar Operação V2 <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Badge variant="secondary" className="px-3 py-1 text-sm font-semibold text-slate-600">
              Status Global: Fase 2 (Inventário)
            </Badge>
          </div>
          <div className="mt-2 text-sm text-amber-600 font-bold bg-amber-50 p-2 rounded border border-amber-200">
            ⚠️ BUG CRÍTICO IDENTIFICADO: O Agente IA não está carregando o workspace Mind (carrega um vazio). 
            Resolução determinística em andamento.
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {phases.map((phase) => {
            const Icon = phase.icon;
            return (
              <Card key={phase.id} className="relative overflow-hidden p-6 shadow-sm border-slate-200">
                <div className="mb-4 flex items-center justify-between">
                  <div className={`rounded-full bg-slate-100 p-2 ${phase.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Fase {phase.id}
                  </span>
                </div>
                <h3 className="mb-1 text-lg font-bold text-slate-800">{phase.title}</h3>
                <p className="mb-4 text-xs font-medium text-slate-500">{phase.status}</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold text-slate-400">
                    <span>PROGRESSO</span>
                    <span>{phase.progress}%</span>
                  </div>
                  <Progress value={phase.progress} className="h-1.5" />
                </div>
              </Card>
            );
          })}
        </div>

        <section className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-xl font-bold text-slate-900">Diretrizes da Fase 2 — Inventário Técnico</h2>
          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Arquivos em Auditoria</h4>
              <ul className="space-y-2">
                {[
                  "src/lib/ai.server.ts",
                  "src/lib/agent-modules.ts",
                  "src/lib/agent-identity.server.ts",
                  "src/lib/send-agent-guarded.server.ts"
                ].map((file) => (
                  <li key={file} className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2 text-sm font-mono text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    {file}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Ações Obrigatórias</h4>
              <div className="rounded-xl bg-slate-900 p-6 text-slate-300">
                <ul className="space-y-3 text-sm leading-relaxed">
                  <li className="flex gap-2">
                    <span className="text-emerald-400 font-bold">1.</span>
                    Bloquear qualquer execução V1 no Webhook.
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-400 font-bold">2.</span>
                    Migrar utilitários compartilhados para camada neutra.
                  </li>
                  <li className="flex gap-2 text-white font-medium">
                    <span className="text-emerald-400 font-bold">3.</span>
                    Implementar limite rígido de 1 chamada LLM por turno.
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-400 font-bold">4.</span>
                    Garantir fallback determinístico (sem Claude) em falhas.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <footer className="text-center text-xs text-slate-400">
          ZapAgent Decommissioning Utility · Version 1.0.0-beta · July 2026
        </footer>
      </div>
    </div>
  );
}
