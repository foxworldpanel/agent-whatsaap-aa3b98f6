import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ShieldCheck, 
  Terminal,
  Activity,
  History,
  Scale,
  Mic,
  ImageIcon,
  Zap,
  Cpu,
  FileText,
  AlertCircle,
  Database,
  Search,
  CheckCircle2,
  Layout,
  MessageSquare,
  SearchCode,
  Bug,
  TestTube2,
  FileSearch,
  CheckSquare
} from "lucide-react";

export const Route = createFileRoute('/')({
  component: IncidentActive,
});

function IncidentActive() {
  const content = `INCIDENTE AINDA ATIVO — FALLBACK CONTINUA NO WHATSAPP
A correção anterior não resolveu.
O agente continua retornando no canal real:
“Desculpe, tive um problema técnico.”

Não alterar interface.
Não implementar novas funcionalidades.
Não fazer nova auditoria geral.
Não declarar o problema resolvido sem teste real.

OBJETIVO ÚNICO:
Localizar e corrigir a exceção exata que ocorreu na última mensagem enviada pelo WhatsApp.

==================================================
1. LOCALIZAR A EXECUÇÃO REAL QUE FALHOU
==================================================
Pesquisar nos logs a execução mais recente do contato de teste.
Identificar pelo:
- horário da última mensagem;
- número anonimizado;
- workspace_id;
- message_id;
- correlation_id.

Apresentar a sequência completa:
- webhook recebido;
- payload normalizado;
- conversa carregada;
- estado carregado;
- catálogo carregado;
- modelo escolhido;
- chamada ao provider;
- parsing;
- persistência;
- analytics;
- envio da resposta.

Marcar exatamente:
ÚLTIMA ETAPA COM SUCESSO:
PRIMEIRA ETAPA COM FALHA:

==================================================
2. MOSTRAR A EXCEÇÃO ORIGINAL
==================================================
Não mostrar apenas o fallback.
Mostrar o erro bruto real:
- error.name;
- error.message;
- error.stack;
- error.cause;
- arquivo;
- função;
- linha;
- HTTP status;
- body da resposta externa;
- código de erro do Supabase, Anthropic, OpenAI ou provedor do WhatsApp.

Ocultar somente segredos e chaves.

==================================================
3. IDENTIFICAR ONDE O FALLBACK É GERADO
==================================================
Buscar no projeto inteiro pelas frases:
- “Desculpe, tive um problema técnico”
- “Desculpe, tive um problema técnico momentâneo”
- “Como posso ajudar?”

Listar todas as ocorrências.
Para cada ocorrência informar:
- arquivo;
- função;
- catch responsável;
- quais erros chegam nesse catch.

Confirmar qual ocorrência gerou a mensagem da última conversa.

==================================================
4. TESTAR O PIPELINE EM ETAPAS
==================================================
Usar a mesma mensagem real: “Olá”.
Executar isoladamente:
ETAPA A — webhook e normalização
ETAPA B — leitura da conversa
ETAPA C — leitura da memória
ETAPA D — catálogo
ETAPA E — prompt builder
ETAPA F — roteamento
ETAPA G — chamada Haiku
ETAPA H — parser da resposta
ETAPA I — persistência
ETAPA J — analytics
ETAPA K — envio ao WhatsApp

Apresentar PASSOU ou FALHOU em cada etapa.
Parar de especular. Identificar a primeira etapa que falha.

==================================================
5. PROVAR SE A ANTHROPIC ESTÁ FUNCIONANDO
==================================================
No mesmo ambiente do webhook:
- executar GET /v1/models;
- usar o Haiku válido retornado;
- fazer uma chamada mínima com “Responda apenas OK”.

Apresentar:
- modelo;
- status HTTP;
- resposta;
- tokens;
- latência.

Depois executar a mesma chamada pelo código real usado no webhook.
Se o teste direto passar e o webhook falhar, o problema está no pipeline interno, não na Anthropic.

==================================================
6. ISOLAR COMPONENTES SECUNDÁRIOS
==================================================
Executar um turno com modo diagnóstico:
- sem analytics;
- sem agent_metadata;
- sem máquina de estados;
- sem catálogo;
- sem saída estruturada;
- sem áudio;
- sem visão;
- sem chamadas paralelas.

Fluxo mínimo:
WhatsApp→ webhook→ Haiku→ texto simples→ WhatsApp

Se funcionar, reativar uma camada por vez:
1. catálogo;
2. histórico;
3. saída estruturada;
4. memória;
5. máquina de estados;
6. analytics.

Após cada camada, testar “Olá” pelo WhatsApp real.
A primeira camada que fizer o fallback voltar é a causadora.

==================================================
7. NÃO DEIXAR ERRO SECUNDÁRIO DERRUBAR O TURNO
==================================================
Falhas em:
- analytics;
- persistência;
- classificação;
- atualização de estado;
- métricas;
- logs;
- memória não essencial
não podem impedir o envio da resposta ao cliente.

A resposta do Haiku deve ser enviada mesmo que uma dessas etapas falhe.
Registrar o erro secundário separadamente.

==================================================
8. VALIDAR O ENVIO AO WHATSAPP
==================================================
Confirmar se o Haiku gera resposta, mas o envio falha.
Apresentar:
- payload enviado ao provedor;
- status HTTP;
- body da resposta;
- message_id de saída;
- confirmação de entrega.

Diferenciar claramente:
- erro antes da IA;
- erro na IA;
- erro depois da IA;
- erro no envio ao WhatsApp.

==================================================
9. CRITÉRIO DE CONCLUSÃO
==================================================
Só considerar corrigido quando houver evidência real:
1. mensagem “Olá” enviada no WhatsApp;
2. webhook recebido;
3. Haiku retornou HTTP 200;
4. resposta normal foi enviada;
5. mensagem foi recebida no aparelho;
6. fallback técnico não apareceu.

==================================================
ENTREGA OBRIGATÓRIA
==================================================
CORRELATION_ID DA FALHA:
FALLBACK GERADO EM:
EXCEÇÃO ORIGINAL:
ARQUIVO:
FUNÇÃO:
LINHA:
ÚLTIMA ETAPA COM SUCESSO:
PRIMEIRA ETAPA COM FALHA:
ANTHROPIC DIRETA FUNCIONOU:
HAIKU PELO WEBHOOK FUNCIONOU:
RESPOSTA FOI GERADA:
ENVIO AO WHATSAPP FUNCIONOU:
CAMADA CAUSADORA:
CORREÇÃO APLICADA:
TESTE REAL APÓS CORREÇÃO:
MENSAGEM RECEBIDA NO APARELHO:
PROBLEMA RESOLVIDO:

Não responder apenas “Runtime recuperada”.
Não responder apenas “corrigido”.
Apresentar a exceção original e o teste real.`;

  return (
    <div className="min-h-screen bg-black text-slate-300 p-6 font-mono text-[13px] leading-tight">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Urgent Header */}
        <header className="border-4 border-red-600 bg-red-950/20 p-6 rounded-none space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-600 animate-pulse">
              <AlertCircle className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tighter text-white">INCIDENTE AINDA ATIVO — FALLBACK CONTINUA NO WHATSAPP</h1>
              <p className="text-red-400 font-bold uppercase mt-1">A correção anterior não resolveu. O agente continua falhando.</p>
            </div>
          </div>
        </header>

        {/* Action Constraints */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-slate-900 border-red-500/50 rounded-none border-l-4">
            <CardHeader className="py-3 px-4 flex flex-row items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-red-500" />
              <CardTitle className="text-xs font-bold uppercase text-red-400">Restrições de Ação</CardTitle>
            </CardHeader>
            <CardContent className="py-0 px-4 pb-4">
              <ul className="space-y-1 text-[11px] text-slate-400 font-bold uppercase">
                <li>• Não alterar interface</li>
                <li>• Não implementar novas funcionalidades</li>
                <li>• Não fazer nova auditoria geral</li>
                <li>• Não declarar resolvido sem teste real</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-emerald-500/50 rounded-none border-l-4">
            <CardHeader className="py-3 px-4 flex flex-row items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-500" />
              <CardTitle className="text-xs font-bold uppercase text-emerald-400">Objetivo Único</CardTitle>
            </CardHeader>
            <CardContent className="py-0 px-4 pb-4">
              <p className="text-[11px] text-slate-300 font-bold">
                Localizar e corrigir a exceção exata que ocorreu na última mensagem enviada pelo WhatsApp.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Step-by-Step Protocol */}
        <div className="space-y-4 border-l-2 border-slate-800 pl-4">
          <Section protocol="1" title="LOCALIZAR A EXECUÇÃO REAL QUE FALHOU" icon={<SearchCode className="w-4 h-4" />}>
            <p>Pesquisar nos logs pela execução mais recente. Identificar por horário, número, workspace_id e correlation_id.</p>
            <div className="mt-2 p-2 bg-black border border-slate-800 rounded text-[11px] space-y-1">
              <div className="flex justify-between border-b border-slate-900 pb-1">
                <span>ÚLTIMA ETAPA COM SUCESSO:</span>
                <span className="text-blue-500 font-bold">__</span>
              </div>
              <div className="flex justify-between">
                <span>PRIMEIRA ETAPA COM FALHA:</span>
                <span className="text-red-500 font-bold">__</span>
              </div>
            </div>
          </Section>

          <Section protocol="2" title="MOSTRAR A EXCEÇÃO ORIGINAL" icon={<Bug className="w-4 h-4" />}>
            <p>Capturar erro bruto real: stack, cause, arquivo, função, linha, HTTP status e body da resposta externa.</p>
            <p className="text-red-500 text-[10px] uppercase font-bold mt-1">NÃO MOSTRAR APENAS O FALLBACK.</p>
          </Section>

          <Section protocol="3" title="IDENTIFICAR ORIGEM DO FALLBACK" icon={<FileSearch className="w-4 h-4" />}>
            <p>Buscar frases de erro técnico no código. Listar arquivos, funções e catches responsáveis.</p>
          </Section>

          <Section protocol="4" title="TESTAR PIPELINE EM ETAPAS" icon={<TestTube2 className="w-4 h-4" />}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[10px] uppercase">
              {['A: Webhook', 'B: Conversa', 'C: Memória', 'D: Catálogo', 'E: Prompt', 'F: Roteamento', 'G: Model', 'H: Parser', 'I: Persist', 'J: Analytics', 'K: Send'].map(step => (
                <div key={step} className="p-1 border border-slate-800 bg-slate-900/50 text-center">{step}</div>
              ))}
            </div>
          </Section>

          <Section protocol="5" title="PROVAR ANTHROPIC / HAIKU" icon={<Cpu className="w-4 h-4" />}>
            <p>Testar GET /v1/models e chamada direta com "Responda apenas OK" no ambiente do webhook.</p>
          </Section>

          <Section protocol="6" title="ISOLAMENTO DE CAMADAS" icon={<Layout className="w-4 h-4" />}>
            <p>Executar fluxo mínimo (Modo Diagnóstico) e reativar camadas uma a uma até falhar.</p>
          </Section>

          <Section protocol="7" title="TOLERÂNCIA A ERROS SECUNDÁRIOS" icon={<Scale className="w-4 h-4" />}>
            <p>Erros em Analytics, Persistência ou Métricas não podem impedir o envio da resposta.</p>
          </Section>

          <Section protocol="8" title="VALIDAR ENVIO WHATSAPP" icon={<MessageSquare className="w-4 h-4" />}>
            <p>Confirmar se o Haiku gera resposta mas o envio falha. Auditar payloads e HTTP status do provedor.</p>
          </Section>
        </div>

        {/* Conclusion Criteria */}
        <div className="bg-slate-900 p-4 border border-slate-800 space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-emerald-500" />
            9. CRITÉRIO DE CONCLUSÃO
          </h3>
          <ul className="text-[11px] space-y-1 text-slate-400">
            <li className="flex gap-2"><span>1.</span> Mensagem recebida no aparelho (Teste Real)</li>
            <li className="flex gap-2"><span>2.</span> Haiku retornou HTTP 200</li>
            <li className="flex gap-2"><span>3.</span> Fallback técnico NÃO apareceu</li>
          </ul>
        </div>

        {/* Required Data Block */}
        <footer className="border-t-2 border-red-600 pt-6 space-y-4 bg-slate-950 p-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-white underline decoration-red-600">ENTREGA OBRIGATÓRIA</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-8 text-[11px]">
            <DataRow label="CORRELATION_ID DA FALHA" />
            <DataRow label="FALLBACK GERADO EM" />
            <DataRow label="EXCEÇÃO ORIGINAL" />
            <DataRow label="ARQUIVO / FUNÇÃO / LINHA" />
            <DataRow label="PRIMEIRA ETAPA COM FALHA" />
            <DataRow label="ANTHROPIC DIRETA OK?" />
            <DataRow label="RESPOSTA FOI GERADA?" />
            <DataRow label="ENVIO WHATSAPP OK?" />
            <DataRow label="CAMADA CAUSADORA" />
            <DataRow label="CORREÇÃO APLICADA" />
            <DataRow label="PROBLEMA RESOLVIDO?" />
          </div>
          <div className="text-[10px] text-red-500 font-bold uppercase text-center pt-4 border-t border-slate-900">
            Não responder apenas "Runtime recuperada". Apresentar evidência bruta.
          </div>
        </footer>

      </div>
    </div>
  );
}

function Section({ protocol, title, icon, children }: { protocol: string, title: string, icon: React.ReactNode, children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold bg-slate-800 px-1.5 py-0.5 rounded">{protocol}</span>
        <span className="text-slate-500">{icon}</span>
        <h3 className="font-bold tracking-tight text-slate-100 uppercase text-xs">{title}</h3>
      </div>
      <div className="pl-12 text-[12px] text-slate-400">
        {children}
      </div>
    </div>
  );
}

function DataRow({ label }: { label: string }) {
  return (
    <div className="flex justify-between border-b border-slate-900 py-1">
      <span className="text-slate-500 uppercase tracking-tighter">{label}:</span>
      <span className="text-red-500 font-bold">[PENDENTE]</span>
    </div>
  );
}
