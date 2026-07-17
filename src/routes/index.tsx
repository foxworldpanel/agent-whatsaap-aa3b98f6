import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Terminal, CheckCircle2, Mic } from "lucide-react";

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
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">CORREÇÃO OBJETIVA — FLUXO DE ÁUDIO FALHANDO</h1>
              <p className="text-red-400 font-bold uppercase mt-1 text-[10px]">OBJETIVO ÚNICO: CORRIGIR O FLUXO DE ÁUDIO PONTA A PONTA.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="space-y-4">
            <Card className="bg-slate-950 border-slate-800 rounded-none h-full">
              <CardHeader className="py-2 px-3 border-b border-slate-800">
                <CardTitle className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-2">
                  <Terminal className="w-3 h-3" /> 1. PROTOCOLO DE RECUPERAÇÃO DE ÁUDIO
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2 text-slate-400">
                <div className="space-y-1 border-l border-slate-800 pl-2">
                   <p className="text-green-500 font-bold uppercase">Teste real texto: OK</p>
                   <p className="text-red-500 font-bold uppercase">Teste real áudio: FALHOU ("Desculpe, tive um problema...")</p>
                </div>
                <p className="mt-2 text-white font-bold underline">ETAPAS OBRIGATÓRIAS:</p>
                <p>• Localizar falha real no log via Correlation ID.</p>
                <p>• Validar Payload Uazapi (media_id, URL, mimetype).</p>
                <p>• Validar Download (401/403/URL expirada?).</p>
                <p>• Validar Whisper (Formatos aceitos: mp3, wav, m4a, opus).</p>
                <p>• Resposta em TEXTO (Não gerar voz / ElevenLabs).</p>
                <p>• Tolerância: Se Whisper falhar, pedir para o cliente escrever.</p>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <Card className="bg-slate-950 border-slate-800 rounded-none h-full text-[10px]">
              <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
                <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-green-500" /> 10. ENTREGA FINAL (STATUS ÁUDIO)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-1">
                <StatusRow label="CORRELATION_ID" value="PENDING_AUDIO_TEST" />
                <StatusRow label="TIPO DE ÁUDIO" value="WAITING" />
                <StatusRow label="MIME TYPE" value="WAITING" />
                <StatusRow label="DOWNLOAD STATUS" value="NOT_STARTED" />
                <StatusRow label="FORMATO CONVERTIDO" value="NONE" />
                <StatusRow label="WHISPER STATUS" value="NOT_CALLED" />
                <StatusRow label="TRANSCRIÇÃO" value="---" />
                <StatusRow label="HAIKU STATUS" value="WAITING" />
                <StatusRow label="WHATSAPP_SEND" value="WAITING" />
                <StatusRow label="MESSAGE_ID" value="---" />
                <StatusRow label="ERRO ORIGINAL" value="Desculpe, tive um problema técnico..." color="text-red-500" />
                <StatusRow label="PROBLEMA RESOLVIDO" value="NÃO" color="text-red-500" />
                <StatusRow label="FALLBACK DESAPARECEU" value="NÃO" color="text-red-500" />
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Warning Footer */}
        <footer className="bg-red-950/10 border-l-4 border-red-600 p-4">
          <p className="text-[10px] text-red-400 font-bold uppercase">
            NÃO ALTERAR: FLUXO DE TEXTO, HAIKU, PROMPT, RESOLUÇÃO DE CONTATO, MÁQUINA DE ESTADOS.
            OBJETIVO ÚNICO: Corrigir o fluxo de áudio ponta a ponta.
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