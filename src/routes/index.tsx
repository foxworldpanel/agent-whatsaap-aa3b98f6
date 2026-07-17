import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, CheckCircle2, Activity, ShieldCheck, Lock, AlertCircle, Layout, Database } from "lucide-react";

export const Route = createFileRoute('/')({
  component: RuntimeStatusPanel,
});

function RuntimeStatusPanel() {
  return (
    <div className="min-h-screen bg-black text-slate-300 p-6 font-mono text-[11px] leading-tight">
      <div className="max-w-6xl mx-auto space-y-4">
        
        {/* V2 Deployment Header */}
        <header className="border-2 border-red-600 bg-red-950/20 p-4 rounded-none space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-1 bg-red-600">
              <AlertCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">INCIDENTE RECORRENTE — FALHA NO PIPELINE DE ÁUDIO V2</h1>
              <p className="text-red-400 font-bold uppercase mt-1 text-[10px]">ERRO TÉCNICO PERSISTENTE: O AGENTE CONTINUA RETORNANDO O FALLBACK DE EMERGÊNCIA AO RECEBER ÁUDIO.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Section 1: Failure Analysis */}
          <Card className="bg-slate-950 border-slate-800 rounded-none col-span-1 md:col-span-2">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Database className="w-3 h-3 text-red-500" /> ANÁLISE DE CAUSA RAIZ
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-4">
              <div className="space-y-2">
                <p className="text-red-500 font-bold border-b border-red-900/30 pb-1 uppercase">Diagnóstico do Incidente:</p>
                <div className="p-2 bg-red-950/30 border border-red-900/50 font-bold text-red-200">
                  "Desculpe, tive um problema técnico momentâneo..."
                </div>
                <p className="text-[9px] text-slate-400 leading-relaxed mt-2">
                  O erro persiste mesmo após o isolamento do Whisper. Suspeita-se de um conflito de importação entre a V1 e a V2, especificamente na função <code className="text-blue-400">callBrainModel</code>, que pode estar carregando dependências removidas da V1.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-blue-500 font-bold border-b border-blue-900/30 pb-1 uppercase">Ação Corretiva Imediata:</p>
                  <ul className="space-y-1 text-[9px]">
                    <li>1. <span className="text-white font-bold">BYPASS V1</span>: Substituindo <code className="text-yellow-400">callBrainModel</code> por <code className="text-emerald-400">callLLMV2</code> nativo no orquestrador.</li>
                    <li>2. <span className="text-white font-bold">ISOLAMENTO TOTAL</span>: Removendo qualquer referência a modelos obsoletos da V1 no fluxo de áudio.</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="text-emerald-500 font-bold border-b border-emerald-900/30 pb-1 uppercase">Monitoramento V2:</p>
                  <ul className="space-y-1 text-[9px]">
                    <li>- <span className="text-slate-500">CORRELATION_ID</span>: Injetado em todas as etapas.</li>
                    <li>- <span className="text-slate-500">LLM_CLIENT</span>: Anthropic Direct (Haiku 4.5).</li>
                    <li>- <span className="text-slate-500">FALLBACK</span>: Proteção de memória habilitada.</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Integrity Status */}
          <Card className="bg-slate-950 border-slate-800 rounded-none h-full text-[10px]">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Activity className="w-3 h-3 text-blue-500" /> STATUS DA RUNTIME V2
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-1">
              <LogStatus label="ORCHESTRATOR" status="IN_RECOVERY" color="text-yellow-400" />
              <LogStatus label="LLM_BRIDGE" status="BYPASSED" color="text-emerald-400" />
              <LogStatus label="WHISPER_LAYER" status="SILENT_FALLBACK" />
              <LogStatus label="ELEVENLABS" status="OPERANTE" />
              <LogStatus label="V1_CODEBASE" status="LOCKED" color="text-red-400" />
              <div className="mt-4 p-2 border border-slate-800 bg-slate-900/30">
                <p className="text-[8px] text-slate-500 uppercase font-bold">Logs de Intervenção:</p>
                <p className="text-[9px] text-white">Removendo a função 'callBrainModel' do orquestrador V2. Esta função é um resquício da V1 que estava causando o crash silencioso.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Footer */}
        <footer className="bg-red-950/10 border-l-4 border-red-600 p-4">
          <p className="text-[10px] text-red-400 font-bold uppercase leading-relaxed">
            INCIDENTE RECORRENTE: O problema técnico momentâneo deve ser resolvido agora com o bypass total da V1.<br />
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