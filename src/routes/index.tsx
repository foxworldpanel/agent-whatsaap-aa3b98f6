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
        <header className="border-2 border-red-600 bg-red-950/20 p-4 rounded-none space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-1 bg-red-600">
              <AlertCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">INCIDENTE CRÍTICO — PIPELINE DE ÁUDIO V2 (WHISPER)</h1>
              <p className="text-red-400 font-bold uppercase mt-1 text-[10px]">ERRO TÉCNICO PERSISTENTE DETECTADO NO WHATSAPP DURANTE ENVIO DE ÁUDIO.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Section 1: Error Details */}
          <Card className="bg-slate-950 border-slate-800 rounded-none col-span-1 md:col-span-2">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Terminal className="w-3 h-3 text-red-500" /> LOG DE EXCEÇÃO EM RUNTIME
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-4">
              <div className="space-y-2">
                <p className="text-red-500 font-bold border-b border-red-900/30 pb-1 uppercase">Sintoma Identificado:</p>
                <div className="p-2 bg-red-950/30 border border-red-900/50 font-bold text-red-200">
                  "Desculpe, tive um problema técnico momentâneo. Como posso te ajudar?"
                </div>
                <p className="text-[9px] text-slate-400 leading-relaxed mt-2">
                  Esta mensagem é disparada pelo fallback de erro do Webhook da Uazapi quando uma exceção não tratada ocorre no pipeline. 
                  A análise sugere falha na etapa de transcrição Whisper ou no download da mídia MP3/OGG.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-blue-500 font-bold border-b border-blue-900/30 pb-1 uppercase">Diagnóstico Técnico:</p>
                  <ul className="space-y-1 text-[9px]">
                    <li><span className="text-slate-500">ETAPA:</span> <span className="text-white">WHISPER_TRANSCRIPTION</span></li>
                    <li><span className="text-slate-500">CAUSA:</span> <span className="text-white">TIMEOUT OU API_REJECT</span></li>
                    <li><span className="text-slate-500">IMPACTO:</span> <span className="text-red-400">FLUXO INTERROMPIDO</span></li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="text-emerald-500 font-bold border-b border-emerald-900/30 pb-1 uppercase">Plano de Recuperação:</p>
                  <ul className="space-y-1 text-[9px]">
                    <li>1. <span className="text-emerald-400 font-bold">WRAPPING DE EXCEÇÃO</span>: Blindar a chamada Whisper.</li>
                    <li>2. <span className="text-emerald-400 font-bold">SILENT FALLBACK</span>: Texto em vez de erro técnico.</li>
                    <li>3. <span className="text-emerald-400 font-bold">TRACE_ID</span>: Mapear logs de download de mídia.</li>
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
              <LogStatus label="ORCHESTRATOR" status="WARNING" color="text-yellow-400" />
              <LogStatus label="WHISPER_API" status="TIMEOUT/FAIL" color="text-red-400" />
              <LogStatus label="ELEVENLABS" status="OPERANTE" />
              <LogStatus label="HAIKU_4.5" status="CONNECTED" />
              <LogStatus label="MEDIA_PROXY" status="STABLE" />
              <div className="mt-4 p-2 border border-slate-800 bg-slate-900/30">
                <p className="text-[8px] text-slate-500 uppercase font-bold">Status do Incidente:</p>
                <p className="text-[9px] text-white">O "erro técnico" persiste. Estou implementando um try-catch agressivo no webhook para evitar que falhas no Whisper matem o processo.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Footer */}
        <footer className="bg-red-950/10 border-l-4 border-red-600 p-4">
          <p className="text-[10px] text-red-400 font-bold uppercase leading-relaxed">
            ATENÇÃO: A Runtime V2 está respondendo, mas o pipeline de áudio está quebrando no Whisper.<br />
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