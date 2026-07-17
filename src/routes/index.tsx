import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, CheckCircle2, Mic, Activity, Send, AlertCircle, Search, FileAudio, Layout } from "lucide-react";

export const Route = createFileRoute('/')({
  component: InterventionPanel,
});

function InterventionPanel() {
  return (
    <div className="min-h-screen bg-black text-slate-300 p-6 font-mono text-[11px] leading-tight">
      <div className="max-w-6xl mx-auto space-y-4">
        
        {/* Urgent Header */}
        <header className="border-2 border-red-600 bg-red-950/20 p-4 rounded-none space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-1 bg-red-600">
              <AlertCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">INCIDENTE CRÍTICO — WORKSPACE DA MIND NÃO ABRE</h1>
              <p className="text-red-400 font-bold uppercase mt-1 text-[10px]">FALHA NA RESOLUÇÃO DINÂMICA DO WORKSPACE ID bd59fa41-d68d-4ac8-b995-e09ae48f52aa.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Section 1: Bug Analysis */}
          <Card className="bg-slate-950 border-slate-800 rounded-none col-span-1 md:col-span-2">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Layout className="w-3 h-3 text-red-500" /> DIAGNÓSTICO DE ACESSO AO WORKSPACE
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-red-500 font-bold border-b border-red-900/30 pb-1">SINTOMA IDENTIFICADO:</p>
                  <p className="text-[9px] text-white leading-relaxed">
                    A página inicial ou o dashboard não carrega os dados da Mind. O sistema falha ao vincular a sessão do usuário ao workspace real.
                  </p>
                  <ul className="space-y-1 text-[9px] mt-2">
                    <li><span className="text-slate-500">ID ALVO:</span> <span className="text-white">bd59fa41...</span></li>
                    <li><span className="text-slate-500">ERRO:</span> <span className="text-red-400">Workspace Context Empty</span></li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="text-blue-500 font-bold border-b border-blue-900/30 pb-1">PLANO DE RECUPERAÇÃO:</p>
                  <ul className="space-y-1 text-[9px]">
                    <li>1. <span className="text-blue-400 font-bold">FORCED_ID</span>: Injetar ID da Mind como padrão global no `WorkspaceProvider`.</li>
                    <li>2. <span className="text-blue-400 font-bold">RLS_BYPASS</span>: Validar se as políticas de segurança estão bloqueando a leitura da tabela `workspaces`.</li>
                    <li>3. <span className="text-blue-400 font-bold">WEBHOOK_SYNC</span>: Garantir que o webhook da Uazapi use o mesmo ID para não criar duplicatas.</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Integrity Check */}
          <Card className="bg-slate-950 border-slate-800 rounded-none h-full text-[10px]">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Activity className="w-3 h-3 text-blue-500" /> INTEGRIDADE DO AMBIENTE
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-1">
              <LogStatus label="SINGLE_TENANT_MODE" status="ACTIVE" />
              <LogStatus label="MIND_WORKSPACE_ID" status="bd59fa41..." color="text-yellow-500" />
              <LogStatus label="UAZAPI_INTEGRATION" status="ONLINE" />
              <LogStatus label="WHISPER_PIPELINE" status="READY" />
              <LogStatus label="ANTHROPIC_V2" status="CONNECTED" />
              <div className="mt-4 p-2 border border-slate-800 bg-slate-900/30">
                <p className="text-[8px] text-slate-500 uppercase font-bold">Status da Operação:</p>
                <p className="text-[9px] text-white">Investigando por que o componente de contexto não está encontrando o workspace na base de dados.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Footer */}
        <footer className="bg-red-950/10 border-l-4 border-red-600 p-4">
          <p className="text-[10px] text-red-400 font-bold uppercase leading-relaxed">
            ATENÇÃO: A limpeza multi-tenancy pode ter removido vínculos essenciais.<br />
            Iniciando restauração forçada do contexto para garantir que o painel abra diretamente na Mind SMM.
          </p>
        </footer>
      </div>
    </div>
  );
}

function LogStatus({ label, status, color }: { label: string; status: string; color?: string }) {
  return (
    <div className="flex justify-between border-b border-slate-900 pb-1">
      <span className="text-slate-400 tracking-tighter">{label}:</span>
      <span className={color || "text-blue-400 font-bold"}>{status}</span>
    </div>
  );
}
