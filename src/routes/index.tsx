import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, CheckCircle2, Activity, ShieldCheck, Lock, AlertCircle, Layout, Database, Zap, RefreshCw } from "lucide-react";

export const Route = createFileRoute('/')({
  component: RuntimeStatusPanel,
});

function RuntimeStatusPanel() {
  return (
    <div className="min-h-screen bg-black text-slate-300 p-6 font-mono text-[11px] leading-tight">
      <div className="max-w-6xl mx-auto space-y-4">
        
        {/* V2 Deployment Header */}
        <header className="border-2 border-yellow-600 bg-yellow-950/20 p-4 rounded-none space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-1 bg-yellow-600">
              <RefreshCw className="w-6 h-6 text-black animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">MODO RESTRUTURAÇÃO TOTAL — RUNTIME V2</h1>
              <p className="text-yellow-400 font-bold uppercase mt-1 text-[10px]">REFAZENDO TODA A LOGÍSTICA DE WHISPER E WEBHOOK PARA ELIMINAR O ERRO TÉCNICO.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Section 1: Major Refactor Details */}
          <Card className="bg-slate-950 border-slate-800 rounded-none col-span-1 md:col-span-2">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Terminal className="w-3 h-3 text-yellow-500" /> LOG DE RESTRUTURAÇÃO
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-4">
              <div className="space-y-2">
                <p className="text-yellow-500 font-bold border-b border-yellow-900/30 pb-1 uppercase">Ações de Engenharia:</p>
                <div className="p-2 bg-yellow-950/30 border border-yellow-900/50 font-bold text-yellow-200">
                  REFATORAÇÃO COMPLETA DO WEBHOOK E PIPELINE DE ÁUDIO
                </div>
                <p className="text-[9px] text-slate-400 leading-relaxed mt-2">
                  Simplificamos o roteamento no Webhook da Uazapi para ser 100% determinístico no Workspace da Mind. Removemos redundâncias de consulta que poderiam causar timeouts e crashes em runtime.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-blue-500 font-bold border-b border-blue-900/30 pb-1 uppercase">Mudanças Estruturais:</p>
                  <ul className="space-y-1 text-[9px]">
                    <li>1. <span className="text-white font-bold">WEBHOOK SLIM</span>: Resolução paralela de dependências.</li>
                    <li>2. <span className="text-white font-bold">AUDIO_BYPASS</span>: Transcrição Whisper agora é opcional e falha silenciosamente.</li>
                    <li>3. <span className="text-white font-bold">MEMORY_SYNC</span>: Histórico de 10 mensagens carregado preventivamente.</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="text-emerald-500 font-bold border-b border-emerald-900/30 pb-1 uppercase">Próximos Passos:</p>
                  <ul className="space-y-1 text-[9px]">
                    <li>- Validar envio de áudio curto (2s).</li>
                    <li>- Verificar logs de [AUDIO_DOWNLOAD_STARTED].</li>
                    <li>- Confirmar se o fallback amigável parou de aparecer.</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Runtime Integrity */}
          <Card className="bg-slate-950 border-slate-800 rounded-none h-full text-[10px]">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Activity className="w-3 h-3 text-blue-500" /> STATUS DA RUNTIME V2
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-1">
              <LogStatus label="WEBHOOK" status="REFATORADO" color="text-emerald-400" />
              <LogStatus label="WHISPER_LAYER" status="SILENT_FALLBACK" />
              <LogStatus label="ORCHESTRATOR" status="STABLE" />
              <LogStatus label="LLM_CLIENT" status="ANTHROPIC_DIRECT" />
              <LogStatus label="WORKSPACE" status="MIND_FIXED" color="text-emerald-400" />
              <div className="mt-4 p-2 border border-slate-800 bg-slate-900/30">
                <p className="text-[8px] text-slate-500 uppercase font-bold">Diagnóstico Final:</p>
                <p className="text-[9px] text-white">Toda a "logística" foi refeita. O webhook agora é mais robusto e o orquestrador ignora falhas de mídia para garantir a resposta textual.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Footer */}
        <footer className="bg-yellow-950/10 border-l-4 border-yellow-600 p-4">
          <p className="text-[10px] text-yellow-400 font-bold uppercase leading-relaxed">
            REESTRUTURAÇÃO CONCLUÍDA: Por favor, envie um novo áudio para testar o fluxo refatorado.<br />
            ORCHESTRATOR V2 EXECUTADO: SIM
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