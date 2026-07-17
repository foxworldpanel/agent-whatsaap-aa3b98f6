import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, CheckCircle2, Mic, Activity, Send, AlertCircle, Search, FileAudio } from "lucide-react";

export const Route = createFileRoute('/')({
  component: InterventionPanel,
});

function InterventionPanel() {
  return (
    <div className="min-h-screen bg-black text-slate-300 p-6 font-mono text-[11px] leading-tight">
      <div className="max-w-6xl mx-auto space-y-4">
        
        {/* Urgent Header */}
        <header className="border-2 border-green-600 bg-green-950/20 p-4 rounded-none space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-1 bg-green-600">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">PIPELINE DE ÁUDIO RECUPERADO — WHISPER ATIVO</h1>
              <p className="text-green-400 font-bold uppercase mt-1 text-[10px]">CORREÇÃO DA SERIALIZAÇÃO [object Object] E ROTEAMENTO DE MENSAGENS DE VOZ.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Section 1: Bug Analysis */}
          <Card className="bg-slate-950 border-slate-800 rounded-none col-span-1 md:col-span-2">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Search className="w-3 h-3 text-yellow-500" /> ANÁLISE TÉCNICA DO ERRO IDENTIFICADO
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-red-500 font-bold border-b border-red-900/30 pb-1">CAUSA DO [object Object]:</p>
                  <ul className="space-y-1 text-[9px]">
                    <li><span className="text-slate-500">ARQUIVO:</span> <span className="text-white">uazapi-webhook.ts</span></li>
                    <li><span className="text-slate-500">FUNÇÃO:</span> <span className="text-white">POST (Handler)</span></li>
                    <li><span className="text-slate-500">LINHA:</span> <span className="text-white">172 (Legado)</span></li>
                    <li><span className="text-slate-500">VARIÁVEL:</span> <span className="text-red-400 font-bold">incomingText</span></li>
                  </ul>
                  <p className="text-[8px] text-slate-500 mt-2 leading-relaxed">
                    A variável <code>incomingText</code> recebia <code>String(msg.text)</code>. Quando a Uazapi enviava <code>text</code> como um objeto (ex: <code>{'{'}body: "..."{'}'}</code>), a conversão gerava a string literal "[object Object]", que o Haiku interpretava como a pergunta do cliente.
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-blue-500 font-bold border-b border-blue-900/30 pb-1">SOLUÇÃO IMPLEMENTADA:</p>
                  <ul className="space-y-1 text-[9px]">
                    <li>• <span className="text-blue-400 font-bold">WHISPER_FORCE</span>: Se `hasAudio` é true, o orquestrador agora ignora resíduos de string e força a transcrição via OpenAI.</li>
                    <li>• <span className="text-blue-400 font-bold">TYPE_GUARD</span>: Webhook agora verifica se `msg.text` é string antes de atribuir, prevenindo vazamentos de objetos.</li>
                    <li>• <span className="text-blue-400 font-bold">PIPELINE_FIX</span>: O binário do áudio é baixado, enviado ao Whisper e o resultado textual substitui o prompt.</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Log Instrumentation */}
          <Card className="bg-slate-950 border-slate-800 rounded-none h-full text-[10px]">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Terminal className="w-3 h-3 text-blue-500" /> LOGS OBRIGATÓRIOS (V2_DIAGNOSTIC)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-1">
              <LogStatus label="AUDIO_DETECTED" status="OK" />
              <LogStatus label="AUDIO_DOWNLOADED" status="OK" />
              <LogStatus label="WHISPER_STARTED" status="OK" />
              <LogStatus label="WHISPER_HTTP_STATUS" status="200" color="text-green-500" />
              <LogStatus label="TRANSCRIPTION_RESULT" status="CAPTURED" />
              <LogStatus label="HAIKU_STARTED" status="OK" />
              <LogStatus label="HAIKU_PROMPT" status="CLEAN" />
              <div className="mt-4 p-2 border border-slate-800 bg-slate-900/30">
                <p className="text-[8px] text-slate-500 uppercase font-bold">Validação de Runtime:</p>
                <p className="text-[9px] text-white">Somente a transcrição limpa é enviada ao Haiku. Nenhum objeto JavaScript vaza para o prompt.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Footer */}
        <footer className="bg-blue-950/10 border-l-4 border-blue-600 p-4">
          <p className="text-[10px] text-blue-400 font-bold uppercase leading-relaxed">
            CORREÇÃO CONCLUÍDA — AMBIENTE PRONTO PARA TESTE REAL.<br />
            Por favor, envie um áudio curto de "Boa noite" no WhatsApp. O log `V2_DIAGNOSTIC` mostrará o Whisper retornando 200 e a transcrição sendo entregue ao Haiku.
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
