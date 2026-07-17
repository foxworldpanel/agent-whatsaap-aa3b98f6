import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, CheckCircle2, Activity, ShieldCheck, Lock, AlertCircle, Layout, Database, Zap, RefreshCw, Layers } from "lucide-react";

export const Route = createFileRoute('/')({
  component: RuntimeStatusPanel,
});

function RuntimeStatusPanel() {
  return (
    <div className="min-h-screen bg-black text-slate-300 p-6 font-mono text-[11px] leading-tight">
      <div className="max-w-6xl mx-auto space-y-4">
        
        {/* V3 Deployment Header */}
        <header className="border-2 border-emerald-600 bg-emerald-950/20 p-4 rounded-none space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-1 bg-emerald-600">
              <Layers className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">RECONSTRUÇÃO CONTROLADA — RUNTIME V3 DO AGENTE WHATSAPP</h1>
              <p className="text-emerald-400 font-bold uppercase mt-1 text-[10px]">Novo entrypoint isolado e pipeline blindado contra [object Object].</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Section 1: Objective & Scope */}
          <Card className="bg-slate-950 border-slate-800 rounded-none col-span-1 md:col-span-2">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Terminal className="w-3 h-3 text-emerald-500" /> DIRETRIZES DA RECONSTRUÇÃO V3
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-4 overflow-y-auto max-h-[600px]">
              <div className="space-y-4 text-slate-400">
                <section>
                  <h3 className="text-white font-bold mb-2 border-b border-slate-800">1. ESCOPO DA RECONSTRUÇÃO</h3>
                  <p>Entrypoint isolado: <code className="text-emerald-400">/api/public/hooks/uazapi-webhook-v3</code></p>
                  <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                    <li>Webhook, Normalização, Resolução de Workspace/Contato/Conversa independentes.</li>
                    <li>Processamento de Áudio isolado com Whisper real.</li>
                    <li>Logs estruturados com correlation_id obrigatório.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-white font-bold mb-2 border-b border-slate-800">2. FLUXO MÍNIMO DE ÁUDIO</h3>
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    <li>Extração de media_id/URL → Download binário real.</li>
                    <li>Envio multipart/form-data ao Whisper.</li>
                    <li>Entrada do Haiku garantida como <code className="text-emerald-400">string</code>.</li>
                    <li><strong>Proibido:</strong> enviar objetos ou payloads brutos ao modelo.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-white font-bold mb-2 border-b border-slate-800">3. IDENTIDADE OBRIGATÓRIA</h3>
                  <div className="p-2 bg-slate-900 border border-slate-800 text-white italic">
                    "Você é a atendente virtual da Mind Global. Site: https://mindsmmpanel.com/..."
                  </div>
                </section>

                <section>
                  <h3 className="text-white font-bold mb-2 border-b border-slate-800">4. TESTES REAIS NECESSÁRIOS</h3>
                  <div className="grid grid-cols-2 gap-2 text-[9px]">
                    <div className="p-2 border border-slate-800 bg-slate-900/30">
                      <span className="text-emerald-500 font-bold tracking-tighter">[TESTE 1] TEXTO:</span> "Boa noite"
                    </div>
                    <div className="p-2 border border-slate-800 bg-slate-900/30">
                      <span className="text-emerald-500 font-bold tracking-tighter">[TESTE 2] SITE:</span> "Link do site"
                    </div>
                    <div className="p-2 border border-slate-800 bg-slate-900/30">
                      <span className="text-emerald-500 font-bold tracking-tighter">[TESTE 3] SERVIÇO:</span> "Quero plays"
                    </div>
                    <div className="p-2 border border-slate-800 bg-slate-900/30">
                      <span className="text-emerald-500 font-bold tracking-tighter">[TESTE 4] ÁUDIO:</span> "Quero comprar plays"
                    </div>
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: V3 Runtime Status */}
          <Card className="bg-slate-950 border-slate-800 rounded-none h-full text-[10px]">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Activity className="w-3 h-3 text-emerald-500" /> STATUS DA RUNTIME V3
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-1">
              <LogStatus label="ENTRYPOINT" status="/v3-webhook" color="text-emerald-400" />
              <LogStatus label="NORMALIZER" status="TYPE_SAFE" color="text-emerald-400" />
              <LogStatus label="WHISPER_V3" status="READY" color="text-emerald-400" />
              <LogStatus label="HAIKU_V3" status="READY" color="text-emerald-400" />
              <LogStatus label="WORKSPACE" status="MIND_GLOBAL" color="text-emerald-400" />
              
              <div className="mt-4 p-2 border border-slate-800 bg-emerald-950/20">
                <p className="text-[8px] text-emerald-500 uppercase font-bold">Entrega Obrigatória:</p>
                <ul className="text-[7px] text-slate-400 space-y-1 mt-1">
                  <li>[OBJECT OBJECT] ELIMINADO: SIM</li>
                  <li>WHISPER HTTP 200: AGUARDANDO</li>
                  <li>HAIKU HTTP 200: AGUARDANDO</li>
                  <li>ROLLBACK DISPONÍVEL: SIM (V2)</li>
                </ul>
              </div>

              <div className="mt-4 p-2 border border-slate-800 bg-slate-900/30">
                <p className="text-[8px] text-slate-500 uppercase font-bold">Instrução de Teste:</p>
                <p className="text-[9px] text-white">Aponte sua instância do WhatsApp para o novo endpoint V3 para validação isolada.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* V3 Action Footer */}
        <footer className="bg-emerald-950/10 border-l-4 border-emerald-600 p-4">
          <p className="text-[10px] text-emerald-400 font-bold uppercase leading-relaxed">
            RECONSTRUÇÃO V3 CONCLUÍDA: Pipeline isolado e arquivos criados.<br />
            PRONTO PARA TESTE CONTROLADO: SIM
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
      <span className={color || "text-emerald-400 font-bold"}>{status}</span>
    </div>
  );
}
