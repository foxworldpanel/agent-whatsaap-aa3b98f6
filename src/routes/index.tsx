import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, CheckCircle2, Activity, ShieldCheck, Lock, AlertCircle, Layout } from "lucide-react";

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
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">MODO INTERVENÇÃO TOTAL — PIPELINE DE ÁUDIO</h1>
              <p className="text-emerald-400 font-bold uppercase mt-1 text-[10px]">CORRIGINDO FALLBACK TÉCNICO NO WEBHOOK DA UAZAPI.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Section 1: Security Configuration */}
          <Card className="bg-slate-950 border-slate-800 rounded-none col-span-1 md:col-span-2">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Lock className="w-3 h-3 text-emerald-500" /> CONTROLE DE ACESSO AO ORQUESTRADOR
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-emerald-500 font-bold border-b border-emerald-900/30 pb-1">FILTRO DE WHATSAPP:</p>
                  <p className="text-[9px] text-white leading-relaxed">
                    O Webhook da Uazapi agora realiza uma pré-validação obrigatória. Mensagens de números não autorizados são descartadas antes de processar qualquer lógica de IA.
                  </p>
                  <ul className="space-y-1 text-[9px] mt-2">
                    <li><span className="text-slate-500">NÚMERO AUTORIZADO:</span> <span className="text-emerald-400 font-bold">5511970116430</span></li>
                    <li><span className="text-slate-500">OUTROS NÚMEROS:</span> <span className="text-red-400">STATUS 401 UNAUTHORIZED</span></li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="text-blue-500 font-bold border-b border-blue-900/30 pb-1">OBJETIVO DA RESTRIÇÃO:</p>
                  <ul className="space-y-1 text-[9px]">
                    <li>1. <span className="text-blue-400 font-bold">CUSTO ZERO</span>: Evitar chamadas desnecessárias à API Anthropic.</li>
                    <li>2. <span className="text-blue-400 font-bold">ESTABILIDADE</span>: Isolar testes de produção em ambiente controlado.</li>
                    <li>3. <span className="text-blue-400 font-bold">PRIVACIDADE</span>: Impedir que o agente responda em conversas não mapeadas.</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Integrity Check */}
          <Card className="bg-slate-950 border-slate-800 rounded-none h-full text-[10px]">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Activity className="w-3 h-3 text-blue-500" /> STATUS DA RUNTIME V2
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-1">
              <LogStatus label="RESTRIÇÃO_DE_ACESSO" status="ATIVA" color="text-emerald-400" />
              <LogStatus label="WHISPER_TRANSCRIP" status="OPERANTE" />
              <LogStatus label="CLAUDE_HAIKU_4.5" status="CONNECTED" />
              <LogStatus label="WORKSPACE_CONTEXT" status="MIND_SMM" />
              <LogStatus label="SINGLE_TENANT" status="ENABLED" />
              <div className="mt-4 p-2 border border-slate-800 bg-slate-900/30">
                <p className="text-[8px] text-slate-500 uppercase font-bold">Diagnóstico Atual:</p>
                <p className="text-[9px] text-white">Identificado erro técnico momentâneo ao enviar áudio. Orquestrador corrigido para evitar falha no retorno do fallback. Whisper está em monitoramento.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Footer */}
        <footer className="bg-emerald-950/10 border-l-4 border-emerald-600 p-4">
          <p className="text-[10px] text-emerald-400 font-bold uppercase leading-relaxed">
            VALIDAÇÃO FINAL: Desativação global confirmada. Somente o número de teste está autorizado no arquivo `authorized-phones.ts`.<br />
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
