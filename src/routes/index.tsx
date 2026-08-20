import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, AlertCircle, Terminal, Database, Play, CheckCircle2, Search, ShieldCheck, History, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="min-h-screen bg-background p-6 space-y-8 max-w-4xl mx-auto">
      <Card className="border-primary/20 shadow-xl overflow-hidden">
        <div className="bg-primary/5 p-8 border-b border-primary/10">
          <h1 className="text-3xl font-extrabold tracking-tight text-primary mb-2 uppercase">
            CODE REVIEW – Correções Obrigatórias (Implementação)
          </h1>
          <Badge variant="outline" className="px-3 py-1 border-primary/30 text-primary">Revisão Técnica V2</Badge>
        </div>
        
        <CardContent className="p-8 space-y-8">
          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              Objetivo
            </h2>
            <div className="bg-muted/30 p-4 rounded-lg border text-sm">
              Realizar uma revisão técnica da implementação atual e corrigir inconsistências encontradas.
            </div>
          </div>

          <Alert variant="default" className="border-primary/20 bg-primary/5">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <AlertTitle className="font-bold">Restrições de Escopo</AlertTitle>
            <AlertDescription className="text-xs mt-2">
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 list-disc pl-4">
                <li>Não alterar documentação.</li>
                <li>Não alterar README.</li>
                <li>Não alterar textos.</li>
                <li>Não alterar Validation.</li>
                <li>Não alterar Roadmap.</li>
                <li>Não criar novas telas.</li>
              </ul>
              <p className="mt-3 font-bold text-primary">Executar apenas alterações de código.</p>
            </AlertDescription>
          </Alert>

          <div className="grid gap-6">
            {/* CORREÇÃO 1 */}
            <div className="border rounded-xl p-6 space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-5">
                <Search className="h-20 w-20" />
              </div>
              <h3 className="font-bold text-primary flex items-center gap-2">
                <Badge variant="secondary">CORREÇÃO 1</Badge>
                Remover comentários contraditórios
              </h3>
              <p className="text-sm text-muted-foreground">
                No arquivo: <code className="text-xs bg-muted px-1 rounded">src/lib/instagram-session/playwright-session.service.ts</code>
              </p>
              <p className="text-sm">
                Existe uma implementação que utiliza <code className="text-xs bg-muted px-1 rounded">chromium.launch({"{ headless: false }"})</code>. 
                Remover comentários antigos descrevendo "headless: true" ou ambientes XVFB para manter compatibilidade com o comportamento atual.
              </p>
            </div>

            {/* CORREÇÃO 2 */}
            <div className="border rounded-xl p-6 space-y-3">
              <h3 className="font-bold text-primary flex items-center gap-2">
                <Badge variant="secondary">CORREÇÃO 2</Badge>
                Validar integração completa da ação de conexão
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-[10px] bg-muted/50 p-2 rounded border">
                <span>UI</span> <Play className="h-2 w-2" />
                <span>connectInstagramAction</span> <Play className="h-2 w-2" />
                <span>SessionManager.connect()</span> <Play className="h-2 w-2" />
                <span>openLoginFlow()</span> <Play className="h-2 w-2" />
                <span>Persistência</span> <Play className="h-2 w-2" />
                <span>Update DB</span>
              </div>
              <p className="text-sm">Garantir que nenhuma etapa esteja apenas simulando sucesso.</p>
            </div>

            {/* CORREÇÃO 3 */}
            <div className="border rounded-xl p-6 space-y-3 bg-primary/[0.02]">
              <h3 className="font-bold text-primary flex items-center gap-2">
                <Badge variant="secondary">CORREÇÃO 3</Badge>
                Fluxo de criação da credencial
              </h3>
              <p className="text-sm">Alterar o fluxo para que o registro no banco ocorra <strong>após</strong> o login concluído:</p>
              <div className="text-xs space-y-1 font-mono bg-muted p-3 rounded">
                1. Abrir login → 2. Login concluído → 3. Descobrir username → 4. Criar credencial → 5. Salvar sessão → 6. Status Connected
              </div>
              <p className="text-xs text-destructive font-bold underline">Não criar registros com usuário "pendente".</p>
            </div>

            {/* CORREÇÃO 4 */}
            <div className="border rounded-xl p-6 space-y-3">
              <h3 className="font-bold text-primary flex items-center gap-2">
                <Badge variant="secondary">CORREÇÃO 4</Badge>
                Revisão do banco
              </h3>
              <p className="text-sm">
                Validar se <code className="text-xs bg-muted px-1 rounded">lead_finder_credentials</code> possui todas as colunas. 
                Caso necessário: criar migration, atualizar tipos e remover referências inválidas.
              </p>
            </div>

            {/* CORREÇÃO 5 */}
            <div className="border rounded-xl p-6 space-y-3 border-orange-200 bg-orange-50/10">
              <h3 className="font-bold text-orange-700 flex items-center gap-2">
                <Badge variant="outline" className="text-orange-700 border-orange-200">CORREÇÃO 5</Badge>
                Session Validation
              </h3>
              <p className="text-sm italic font-medium">A função validate() não deve apenas verificar a existência do arquivo.</p>
              <p className="text-sm">Ela deve abrir um contexto real e confirmar que a sessão continua autenticada, caso contrário definir <code className="text-xs bg-muted px-1 rounded">status = Expired</code>.</p>
            </div>

            {/* CORREÇÃO 6 & 7 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-xl p-4 space-y-2">
                <h4 className="font-bold text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  CORREÇÃO 6 – Erros
                </h4>
                <ul className="text-[11px] space-y-1 list-none opacity-80">
                  <li>• Playwright indisponível</li>
                  <li>• Navegador não iniciou</li>
                  <li>• Login cancelado / Timeout</li>
                  <li>• Falha ao salvar Storage State</li>
                </ul>
              </div>
              <div className="border rounded-xl p-4 space-y-2">
                <h4 className="font-bold text-sm flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  CORREÇÃO 7 – Logs
                </h4>
                <div className="flex flex-wrap gap-1">
                  {['Browser Started', 'Login Success', 'Storage Saved', 'Credential Created', 'Session Validated'].map(l => (
                    <Badge key={l} variant="outline" className="text-[9px] py-0">{l}</Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* CORREÇÃO 8 & 9 */}
            <div className="border rounded-xl p-6 space-y-4">
              <div className="space-y-2">
                <h3 className="font-bold text-primary flex items-center gap-2 text-sm">
                  <Badge variant="secondary">CORREÇÃO 8</Badge>
                  Teste de integração
                </h3>
                <p className="text-xs">Validar o fluxo completo da UI ao banco de dados.</p>
              </div>
              <div className="space-y-2 pt-2 border-t">
                <h3 className="font-bold text-primary flex items-center gap-2 text-sm">
                  <Badge variant="secondary">CORREÇÃO 9</Badge>
                  Ambiente de execução
                </h3>
                <p className="text-xs italic">Detectar automaticamente se o backend suporta Playwright e impedir tentativas de conexão com erro técnico claro.</p>
              </div>
            </div>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-5 w-5" />
              Critérios de aceite
            </h2>
            <ul className="text-xs space-y-2 list-none pl-0 font-medium">
              <li className="flex items-start gap-2">
                <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
                <span>O fluxo de conexão não cria registros "pendentes".</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
                <span>A validação da sessão é real (navegação teste).</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
                <span>Banco consistente com o código e erros tratados.</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
                <span>Sistema detecta suporte a Playwright no ambiente.</span>
              </li>
            </ul>
          </div>
          
          <div className="pt-8 border-t text-[10px] text-muted-foreground italic text-center uppercase tracking-widest">
            Minha avaliação do projeto
          </div>
        </CardContent>
      </Card>
    </div>
  ),
});
