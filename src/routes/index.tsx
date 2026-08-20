import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, AlertCircle, Terminal, Database, Play, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="min-h-screen bg-background p-6 space-y-8 max-w-4xl mx-auto">
      <Card className="border-primary/20 shadow-xl overflow-hidden">
        <div className="bg-primary/5 p-8 border-b border-primary/10">
          <h1 className="text-3xl font-extrabold tracking-tight text-primary mb-2">
            CORREÇÃO DA IMPLEMENTAÇÃO – Instagram Session Manager
          </h1>
          <Badge variant="destructive" className="px-3 py-1">MVP Execution Phase</Badge>
        </div>
        
        <CardContent className="p-8 space-y-8">
          <Alert variant="destructive" className="border-destructive/50 bg-destructive/5">
            <AlertCircle className="h-5 w-5" />
            <AlertTitle className="font-bold text-lg">IMPORTANTE</AlertTitle>
            <AlertDescription className="text-sm mt-2 font-medium">
              <ul className="grid grid-cols-2 gap-2 list-none pl-0">
                <li>• Não atualizar documentação.</li>
                <li>• Não atualizar README.</li>
                <li>• Não atualizar Validation.</li>
                <li>• Não atualizar Roadmap.</li>
                <li>• Não atualizar Checklist.</li>
                <li>• Não alterar apenas a interface.</li>
                <li>• Não criar novos mocks.</li>
                <li>• Não criar novas telas.</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              Situação atual
            </h2>
            <div className="bg-muted/50 p-6 rounded-xl border space-y-3 text-sm">
              <p>Após auditoria do código, identifiquei que:</p>
              <ul className="space-y-2 pl-4">
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  o módulo <code>instagram-session</code> foi criado;
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  o <code>InstagramSessionManager</code> foi implementado;
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  os serviços de sessão existem;
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  a interface chama <code>connectInstagramAction</code>.
                </li>
              </ul>
              <p className="pt-2 font-semibold text-destructive italic">
                Porém, a funcionalidade ainda não é utilizável. Além disso, nenhuma mudança é perceptível no Preview.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Terminal className="h-5 w-5 text-primary" />
              Objetivo desta tarefa
            </h2>
            <p className="text-sm">
              Transformar a implementação existente em um fluxo funcional e testável. 
              <strong> Não criar uma segunda implementação.</strong> Corrigir a implementação atual.
            </p>
          </div>

          <div className="grid gap-6">
            <div className="border rounded-xl p-6 space-y-4">
              <h3 className="font-bold text-primary flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">1</span>
                Informar a arquitetura de execução
              </h3>
              <p className="text-xs text-muted-foreground">Antes de alterar qualquer código, verificar e responder:</p>
              <ul className="text-sm space-y-1 list-disc pl-5">
                <li>O Preview do Lovable consegue executar Playwright?</li>
                <li>O Preview consegue abrir um navegador Chromium?</li>
                <li>O Preview consegue gravar arquivos no filesystem (storageState)?</li>
                <li>As Server Functions executam em ambiente Node compatível com Playwright?</li>
              </ul>
            </div>

            <div className="border rounded-xl p-6 space-y-4">
              <h3 className="font-bold text-primary flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">2</span>
                Corrigir o fluxo atual
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-[10px] bg-muted p-3 rounded-lg border">
                <span>Conectar Conta</span> <Play className="h-2 w-2" />
                <span>Abrir navegador</span> <Play className="h-2 w-2" />
                <span>Instagram</span> <Play className="h-2 w-2" />
                <span>Login manual</span> <Play className="h-2 w-2" />
                <span>Autenticação concluída</span> <Play className="h-2 w-2" />
                <span>Capturar informações</span> <Play className="h-2 w-2" />
                <span>Criar registro DB</span> <Play className="h-2 w-2" />
                <span>Salvar Storage State</span> <Play className="h-2 w-2" />
                <span className="font-bold text-primary underline">Status = Connected</span>
              </div>
              <p className="text-xs text-destructive font-bold">Nunca criar registros "pendentes".</p>
            </div>

            <div className="border rounded-xl p-6 space-y-4">
              <h3 className="font-bold text-primary flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">3</span>
                Revisar Playwright
              </h3>
              <p className="text-sm">Verificar <code>headless: true</code> e corrigir para permitir login manual. Se for obrigatoriamente headless, explicar claramente.</p>
            </div>

            <div className="border rounded-xl p-6 space-y-4">
              <h3 className="font-bold text-primary flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">4</span>
                Revisar banco
              </h3>
              <p className="text-sm">Garantir que <code>lead_finder_credentials</code> contenha todas as colunas (migration, schema e tipos).</p>
            </div>

            <div className="border rounded-xl p-6 space-y-4">
              <h3 className="font-bold text-primary flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">5</span>
                Revisar integração & Erros
              </h3>
              <p className="text-sm">Garantir invocação real do Session Manager e implementar mensagens claras para falhas de conexão ou validação.</p>
            </div>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-5 w-5" />
              Critérios obrigatórios
            </h2>
            <ul className="text-sm space-y-2 list-none pl-0">
              <li className="flex gap-2"><strong>• O Preview executa Playwright?</strong> (SIM ou NÃO)</li>
              <li className="flex gap-2"><strong>• Onde o Session Manager realmente roda?</strong></li>
              <li className="flex gap-2"><strong>• Como testar a funcionalidade?</strong></li>
              <li className="flex gap-2"><strong>• O fluxo foi testado?</strong></li>
            </ul>
          </div>
          
          <div className="pt-8 border-t text-xs text-muted-foreground italic text-center">
            Ao finalizar, responda com Ambiente de Execução, Arquivos, Problemas Corrigidos e Como Testar.
          </div>
        </CardContent>
      </Card>
    </div>
  ),
});


