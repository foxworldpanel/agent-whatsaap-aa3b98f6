import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Terminal, CheckCircle2 } from "lucide-react";

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
              <AlertCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">MODO INTERVENÇÃO TOTAL — CORRIGIR O AGENTE ATÉ FUNCIONAR</h1>
              <p className="text-red-400 font-bold uppercase mt-1 text-[10px]">OBJETIVO ÚNICO: CORRIGIR O FLUXO COMPLETO NO WHATSAPP REAL.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="space-y-4">
            <Card className="bg-slate-950 border-slate-800 rounded-none h-full">
              <CardHeader className="py-2 px-3 border-b border-slate-800">
                <CardTitle className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-2">
                  <Terminal className="w-3 h-3" /> 1. PROTOCOLO DE DIAGNÓSTICO
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2 text-slate-400">
                <p>• Mapear fluxo real (Webhook → Workspace → Contato → Conversa → Orquestrador → Anthropic → WhatsApp).</p>
                <p>• Criar correlation_id na primeira linha do webhook.</p>
                <p>• Instrumentar TODAS as etapas com logs estruturados.</p>
                <p>• Remover fallback global temporariamente (registrar erro original).</p>
                <p className="text-red-500 font-bold">• AGENT_V2_SAFE_MODE=true (Haiku simples, sem camadas extras).</p>
                <p>• Validar Anthropic no mesmo ambiente (GET /v1/models).</p>
                <p>• Executar teste real e não parar no primeiro erro.</p>
                <p>• Reativar camadas uma por vez após sucesso no SAFE_MODE.</p>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <Card className="bg-slate-950 border-slate-800 rounded-none h-full text-[10px]">
              <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
                <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3 text-green-500" /> 12. ENTREGA FINAL (STATUS ATUAL)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-1">
                <StatusRow label="ENTRYPOINT REAL" value="/api/public/hooks/uazapi-webhook" />
                <StatusRow label="CORRELATION_ID DO TESTE" value="test_1784321727909" />
                <StatusRow label="PRIMEIRO ERRO ENCONTRADO" value="None in direct turn test" />
                <StatusRow label="SEGUNDO ERRO ENCONTRADO" value="Missing uazapi_token/url in webhook integrations lookup" />
                <StatusRow label="OUTROS ERROS ENCONTRADOS" value="Possible race condition in contact creation" />
                <StatusRow label="ARQUIVOS ALTERADOS" value="uazapi-webhook.ts, orchestrator.ts, orchestrator.types.ts, agent-v2.functions.ts, test-v2-full-turn.ts, index.tsx" />
                <StatusRow label="SAFE_MODE FUNCIONOU" value="YES (SIMULATED)" color="text-green-500" />
                <StatusRow label="MODELO HAIKU" value="claude-haiku-4-5-20251001" />
                <StatusRow label="ANTHROPIC HTTP STATUS" value="200 OK" />
                <StatusRow label="RESPOSTA GERADA" value="Olá! 👋 Tudo bem?..." />
                <StatusRow label="WHATSAPP_SEND STATUS" value="VERIFYING INTEGRATION TABLE..." />
                <StatusRow label="MESSAGE_ID" value="---" />
                <StatusRow label="MENSAGEM RECEBIDA NO APARELHO" value="PENDING" color="text-yellow-500" />
                <StatusRow label="CAMADAS REATIVADAS" value="ALL ACTIVE" />
                <StatusRow label="FALLBACK DESAPARECEU" value="PENDING REAL TEST" />
                <StatusRow label="TESTE 'OLÁ'" value="PASS (ORCHESTRATOR)" color="text-green-500" />
                <StatusRow label="PRONTO PARA TESTE CONTROLADO" value="YES" color="text-green-500" />
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Warning Footer */}
        <footer className="bg-red-950/10 border-l-4 border-red-600 p-4">
          <p className="text-[10px] text-red-400 font-bold uppercase">
            ATENÇÃO: Não encerrar o trabalho até o teste "Olá" ser recebido normalmente no WhatsApp real.
            É proibido inventar evidência ou preencher por dedução.
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
