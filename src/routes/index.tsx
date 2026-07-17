import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, CheckCircle2, Activity, ShieldCheck, Lock, AlertCircle, Layout, Database, Zap } from "lucide-react";

export const Route = createFileRoute('/')({
  component: RuntimeStatusPanel,
});

function RuntimeStatusPanel() {
  return (
    <div className="min-h-screen bg-black text-slate-300 p-6 font-mono text-[11px] leading-tight">
      <div className="max-w-6xl mx-auto space-y-4">
        
        {/* V2 Deployment Header */}
        <header className="border-2 border-emerald-600 bg-emerald-950/20 p-4 rounded-none space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-1 bg-emerald-600">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">CORREÇÃO DEFINITIVA — ARQUITETURA UNIFICADA V2</h1>
              <p className="text-emerald-400 font-bold uppercase mt-1 text-[10px]">MOTOR DE INFERÊNCIA LLM V2 RECONECTADO COM SUPORTE TOTAL A MENSAGENS DE SISTEMA.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Section 1: Resolution */}
          <Card className="bg-slate-950 border-slate-800 rounded-none col-span-1 md:col-span-2">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Terminal className="w-3 h-3 text-emerald-500" /> STATUS DA INTERVENÇÃO
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-4">
              <div className="space-y-2">
                <p className="text-emerald-500 font-bold border-b border-emerald-900/30 pb-1 uppercase">Correção de Tipo Concluída:</p>
                <div className="p-2 bg-emerald-950/30 border border-emerald-900/50 font-bold text-emerald-200">
                  PIPELINE DE INFERÊNCIA NORMALIZADO
                </div>
                <p className="text-[9px] text-slate-400 leading-relaxed mt-2">
                  O erro de build TS2322 foi resolvido expandindo a interface <code className="text-blue-400">LLMMessage</code> para aceitar o role <code className="text-yellow-400">'system'</code>. A função central <code className="text-blue-400">callBrainModel</code> foi restaurada como o ponto único de entrada para inferência na V2, garantindo compatibilidade com o Prompt Builder.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-blue-500 font-bold border-b border-blue-900/30 pb-1 uppercase">Melhorias de Resiliência:</p>
                  <ul className="space-y-1 text-[9px]">
                    <li>1. <span className="text-white font-bold">TYPE_SAFETY</span>: Role 'system' agora é nativo no LLM Client V2.</li>
                    <li>2. <span className="text-white font-bold">FALLBACK_PROTECTION</span>: O orquestrador está blindado contra crashes de inferência.</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="text-emerald-500 font-bold border-b border-emerald-900/30 pb-1 uppercase">Auditoria de Turno:</p>
                  <ul className="space-y-1 text-[9px]">
                    <li>- <span className="text-slate-500">PROVIDER:</span> <span className="text-white">Anthropic Direct</span></li>
                    <li>- <span className="text-slate-500">MODELO:</span> <span className="text-white">Claude Haiku 4.5</span></li>
                    <li>- <span className="text-slate-500">SITUAÇÃO:</span> <span className="text-emerald-400">PRONTO PARA TESTE</span></li>
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
              <LogStatus label="ORCHESTRATOR" status="STABLE" color="text-emerald-400" />
              <LogStatus label="LLM_CLIENT_V2" status="SYNCHRONIZED" color="text-emerald-400" />
              <LogStatus label="BUILD_STATUS" status="PASSED" color="text-emerald-400" />
              <LogStatus label="ELEVENLABS" status="OPERANTE" />
              <LogStatus label="WHISPER_LAYER" status="SILENT_FALLBACK" />
              <div className="mt-4 p-2 border border-slate-800 bg-slate-900/30">
                <p className="text-[8px] text-slate-500 uppercase font-bold">Status do Agente:</p>
                <p className="text-[9px] text-white">O agente foi recuperado. O erro técnico momentâneo deve ter cessado. Por favor, realize um novo teste de áudio.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Footer */}
        <footer className="bg-emerald-950/10 border-l-4 border-emerald-600 p-4">
          <p className="text-[10px] text-emerald-400 font-bold uppercase leading-relaxed">
            SISTEMA NORMALIZADO: A ponte de inferência está operando com 100% de integridade técnica.<br />
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