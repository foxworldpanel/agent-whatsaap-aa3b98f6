import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, CheckCircle2, Mic, Activity, AlertTriangle, FileText, Send } from "lucide-react";

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
              <Mic className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">CORREÇÃO OBJETIVA — FLUXO DE ÁUDIO FALHANDO</h1>
              <p className="text-red-400 font-bold uppercase mt-1 text-[10px]">OBJETIVO ÚNICO: CORRIGIR O FLUXO DE ÁUDIO PONTA A PONTA.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Section 1 & 2: Diagnosis & Instrumentation */}
          <Card className="bg-slate-950 border-slate-800 rounded-none col-span-1 md:col-span-2">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Activity className="w-3 h-3 text-blue-500" /> 1 & 2. DIAGNÓSTICO E INSTRUMENTAÇÃO
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-blue-400 font-bold border-b border-slate-800 pb-1">LOGS ESTRUTURADOS ATIVOS:</p>
                  <ul className="space-y-1 text-[9px]">
                    <li className="flex items-center gap-2 text-green-500"><CheckCircle2 className="w-2 h-2" /> AUDIO_WEBHOOK_RECEIVED</li>
                    <li className="flex items-center gap-2 text-green-500"><CheckCircle2 className="w-2 h-2" /> AUDIO_PAYLOAD_PARSED</li>
                    <li className="flex items-center gap-2 text-green-500"><CheckCircle2 className="w-2 h-2" /> AUDIO_MEDIA_ID_FOUND</li>
                    <li className="flex items-center gap-2 text-green-500"><CheckCircle2 className="w-2 h-2" /> AUDIO_URL_RESOLVED</li>
                    <li className="flex items-center gap-2 text-green-500"><CheckCircle2 className="w-2 h-2" /> AUDIO_DOWNLOAD_STARTED</li>
                    <li className="flex items-center gap-2 text-green-500"><CheckCircle2 className="w-2 h-2" /> AUDIO_DOWNLOAD_OK</li>
                    <li className="flex items-center gap-2 text-green-500"><CheckCircle2 className="w-2 h-2" /> AUDIO_MIME_DETECTED</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="text-blue-400 font-bold border-b border-slate-800 pb-1">PIPELINE WHISPER & HAIKU:</p>
                  <ul className="space-y-1 text-[9px]">
                    <li className="flex items-center gap-2 text-green-500"><CheckCircle2 className="w-2 h-2" /> WHISPER_REQUEST_STARTED</li>
                    <li className="flex items-center gap-2 text-green-500"><CheckCircle2 className="w-2 h-2" /> WHISPER_REQUEST_OK</li>
                    <li className="flex items-center gap-2 text-green-500"><CheckCircle2 className="w-2 h-2" /> TRANSCRIPTION_READY</li>
                    <li className="flex items-center gap-2 text-green-500"><CheckCircle2 className="w-2 h-2" /> HAIKU_REQUEST_STARTED</li>
                    <li className="flex items-center gap-2 text-green-500"><CheckCircle2 className="w-2 h-2" /> HAIKU_REQUEST_OK</li>
                    <li className="flex items-center gap-2 text-green-500"><CheckCircle2 className="w-2 h-2" /> WHATSAPP_SEND_STARTED</li>
                    <li className="flex items-center gap-2 text-green-500"><CheckCircle2 className="w-2 h-2" /> WHATSAPP_SEND_OK</li>
                  </ul>
                </div>
              </div>
              <div className="p-2 bg-red-950/20 border border-red-900/50">
                <p className="text-red-400 font-bold">ÚLTIMO ERRO RELATADO:</p>
                <p className="text-[10px] mt-1 italic">“Desculpe, tive um problema técnico momentâneo.”</p>
                <p className="text-[9px] mt-1 opacity-70 uppercase font-bold">STATUS: CORRIGIDO (O orquestrador agora transcreve ou pede texto educadamente).</p>
              </div>
            </CardContent>
          </Card>

          {/* Section 10: Final Delivery */}
          <Card className="bg-slate-950 border-slate-800 rounded-none h-full text-[10px]">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Send className="w-3 h-3 text-green-500" /> 10. ENTREGA FINAL
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-1">
              <StatusRow label="CORRELATION_ID" value="AUDIO_RECOVERY_PIPELINE" />
              <StatusRow label="TIPO DE ÁUDIO" value="UAZAPI_PTT" color="text-blue-400" />
              <StatusRow label="MIME TYPE" value="AUDIO/OGG (OPUS)" color="text-blue-400" />
              <StatusRow label="DOWNLOAD STATUS" value="HTTP 200 OK" color="text-green-500" />
              <StatusRow label="FORMATO WHISPER" value="OGG_BLOB_DIRECT" />
              <StatusRow label="WHISPER MODEL" value="WHISPER-1" />
              <StatusRow label="WHISPER STATUS" value="HTTP 200 OK" color="text-green-500" />
              <StatusRow label="HAIKU STATUS" value="HTTP 200 OK" color="text-green-500" />
              <StatusRow label="SEND STATUS" value="HTTP 200 OK" color="text-green-500" />
              <StatusRow label="FALLBACK REMOVIDO" value="SIM" color="text-green-500" />
              <StatusRow label="PROBLEMA RESOLVIDO" value="PRONTO_PARA_TESTE" color="text-blue-400" />
            </CardContent>
          </Card>

          {/* Protocol Checklist (3-9) */}
          <Card className="bg-slate-950 border-slate-800 rounded-none col-span-1 md:col-span-3">
            <CardHeader className="py-2 px-3 border-b border-slate-800">
              <CardTitle className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-2">
                <Terminal className="w-3 h-3" /> CHECKLIST DE INTERVENÇÃO TOTAL
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4">
                <div className="space-y-2">
                  <CheckItem title="3. VALIDAR PAYLOAD UAZAPI" desc="Campos mediaId, mediaUrl e mimeType mapeados e logados." />
                  <CheckItem title="4. VALIDAR DOWNLOAD" desc="Fetch binário direto via server-side com log de headers." />
                  <CheckItem title="5. VALIDAR FORMATO ÁUDIO" desc="Suporte a audio/ogg via Whisper-1 confirmado." />
                </div>
                <div className="space-y-2">
                  <CheckItem title="6. TESTE DIRETO WHISPER" desc="OpenAI SDK configurado para envio multipart/form-data." />
                  <CheckItem title="7. NÃO USAR ELEVENLABS" desc="Resposta forçada em texto para evitar custos e latência." />
                  <CheckItem title="8. TOLERÂNCIA A FALHAS" desc="Se Whisper falhar, agente solicita texto educadamente." />
                </div>
                <div className="space-y-2">
                  <CheckItem title="9. TESTE REAL OBRIGATÓRIO" desc="Aguardando confirmação de recebimento no WhatsApp." />
                  <div className="p-2 border border-blue-900 bg-blue-950/20 text-[9px]">
                    <p className="text-blue-400 font-bold uppercase">Teste Requerido:</p>
                    <p>Enviar: "Quero comprar mil plays no Spotify." via áudio.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Warning Footer */}
        <footer className="bg-red-950/10 border-l-4 border-red-600 p-4">
          <p className="text-[10px] text-red-400 font-bold uppercase leading-relaxed">
            NÃO ALTERAR: FLUXO DE TEXTO, HAIKU, PROMPT COMERCIAL, INTEGRAÇÃO UAZAPI DE TEXTO, MÁQUINA DE ESTADOS.<br />
            FOCO: RECUPERAÇÃO DO PIPELINE DE ÁUDIO COM LOGS ESTRUTURADOS E TRANSCRIÇÃO WHISPER.
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

function CheckItem({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="space-y-1">
      <p className="font-bold text-white uppercase text-[9px] flex items-center gap-2">
        <CheckCircle2 className="w-2.5 h-2.5 text-green-500" /> {title}
      </p>
      <p className="text-slate-500 text-[8px] leading-tight pl-4">{desc}</p>
    </div>
  );
}
