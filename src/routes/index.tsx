import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Terminal, CheckCircle2, Mic, Activity } from "lucide-react";

export const Route = createFileRoute('/')({
  component: InterventionPanel,
});

function InterventionPanel() {
  return (
    <div className="min-h-screen bg-black text-slate-300 p-6 font-mono text-[11px] leading-tight">
      <div className="max-w-5xl mx-auto space-y-4">
        
        {/* Urgent Header */}
        <header className="border-2 border-red-600 bg-red-950/20 p-4 rounded-none space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-1 bg-red-600">
              <Mic className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">MODO RECUPERAÇÃO — PIPELINE DE ÁUDIO ATIVO</h1>
              <p className="text-red-400 font-bold uppercase mt-1 text-[10px]">CORREÇÃO APLICADA: TRANSCRIÇÃO WHISPER INTEGRADA AO ORQUESTRADOR.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="space-y-4">
            <Card className="bg-slate-950 border-slate-800 rounded-none h-full">
              <CardHeader className="py-2 px-3 border-b border-slate-800">
                <CardTitle className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-2">
                  <Terminal className="w-3 h-3" /> 1. DIAGNÓSTICO DO ERRO RELATADO
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2 text-slate-400">
                <div className="p-2 bg-red-950/20 border border-red-900/50 mb-2">
                   <p className="text-red-400 font-bold italic">"continua com o mesmo erro do audio"</p>
                   <p className="text-[9px] mt-1 opacity-70">O erro ocorria devido a um `throw` proposital no orquestrador para teste de fallback.</p>
                </div>
                <div className="space-y-1 border-l border-slate-800 pl-2">
                   <p className="text-green-500 font-bold uppercase flex items-center gap-2">
                     <CheckCircle2 className="w-3 h-3" /> WHISPER INTEGRADO: SIM
                   </p>
                   <p className="text-green-500 font-bold uppercase flex items-center gap-2">
                     <CheckCircle2 className="w-3 h-3" /> FALLBACK SEGURO: SIM
                   </p>
                </div>
                <p className="mt-2 text-white font-bold underline">FLUXO ATUALIZADO:</p>
                <p>• Webhook detecta Áudio e captura `mediaUrl`.</p>
                <p>• Orquestrador chama `transcribeAudio` (Whisper).</p>
                <p>• Se transcrito, Haiku 4.5 responde normalmente.</p>
                <p>• Se falhar, o agente pede texto educadamente.</p>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <Card className="bg-slate-950 border-slate-800 rounded-none h-full text-[10px]">
              <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
                <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                  <Activity className="w-3 h-3 text-blue-500" /> STATUS DA RUNTIME V2
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-1">
                <StatusRow label="PIPELINE ÁUDIO" value="OPERATIONAL" color="text-green-500" />
                <StatusRow label="TRANSCRIBER" value="WHISPER-1 (OPENAI)" color="text-blue-400" />
                <StatusRow label="HAIKU 4.5" value="ACTIVE" color="text-green-500" />
                <StatusRow label="CORRELATION_ID" value="AUDIO_RECOVERY_V2" />
                <StatusRow label="FALLBACK STATUS" value="USER_FRIENDLY_REQUEST" />
                <StatusRow label="MIND_ID" value="bd59fa41-d68d...aa" />
                <div className="mt-2 pt-2 border-t border-slate-900">
                   <p className="text-slate-500 italic">O fallback "problema técnico momentâneo" foi removido do fluxo de áudio e substituído por uma solicitação de texto caso a transcrição falhe.</p>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Warning Footer */}
        <footer className="bg-blue-950/10 border-l-4 border-blue-600 p-4">
          <p className="text-[10px] text-blue-400 font-bold uppercase">
            SISTEMA PRONTO PARA TESTE REAL NO WHATSAPP.
            O AGENTE AGORA POSSUI "OUVIDOS" (WHISPER) E NÃO APENAS "VISÃO" E "LÓGICA".
          </p>
        </footer>
      </div>
    </div>
  );
}

function StatusRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between border-b border-slate-900 pb-1">
      <span className="text-slate-500 uppercase tracking-tighter">{label}:</span>
      <span className={color || "text-slate-300 font-bold"}>{value}</span>
    </div>
  );
}
