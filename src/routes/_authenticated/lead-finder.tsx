import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Radar, Search, Database, LayoutList, History, Play, CheckCircle2, XCircle } from "lucide-react"
import { useServerFn } from "@tanstack/react-start"
import { runLeadFinderTest } from "@/lib/lead-finder/test.functions"
import { useState } from "react"
import { toast } from "sonner"


export const Route = createFileRoute('/_authenticated/lead-finder')({
  component: LeadFinderPage,
})

function LeadFinderPage() {
  const runTest = useServerFn(runLeadFinderTest);
  const [isRunning, setIsRunning] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; jobId?: string; error?: string } | null>(null);

  const handleRunTest = async () => {
    setIsRunning(true);
    setTestResult(null);
    try {
      const result = await runTest({ data: {} });
      setTestResult(result);
      if (result.success) {
        toast.success("Teste de integração concluído com sucesso!");
      } else {
        toast.error(`Falha no teste: ${result.error}`);
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro inesperado ao executar teste.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lead Finder</h1>
          <p className="text-muted-foreground">
            Descubra e gerencie leads qualificados de múltiplas plataformas.
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Radar className="h-6 w-6" />
        </div>
      </div>

      <Tabs defaultValue="discovery" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="discovery" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Discovery
          </TabsTrigger>
          <TabsTrigger value="leads" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Banco de Leads
          </TabsTrigger>
          <TabsTrigger value="jobs" className="flex items-center gap-2">
            <LayoutList className="h-4 w-4" />
            Jobs
          </TabsTrigger>
          <TabsTrigger value="timeline" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Timeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discovery">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle>Nova Descoberta</CardTitle>
                <CardDescription>
                  Configure os parâmetros para encontrar novos leads.
                </CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRunTest}
                disabled={isRunning}
                className="gap-2"
              >
                {isRunning ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Run Phase 1 Test
              </Button>
            </CardHeader>
            <CardContent>
              {testResult && (
                <div className={cn(
                  "mb-6 flex items-center gap-3 rounded-lg border p-4",
                  testResult.success ? "bg-success/10 border-success/20 text-success" : "bg-destructive/10 border-destructive/20 text-destructive"
                )}>
                  {testResult.success ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                  <div>
                    <p className="font-medium">
                      {testResult.success ? "Integração validada: OK" : "Erro na validação"}
                    </p>
                    {testResult.jobId && <p className="text-xs opacity-80">Job ID: {testResult.jobId}</p>}
                    {testResult.error && <p className="text-xs opacity-80">{testResult.error}</p>}
                  </div>
                </div>
              )}
              
              <div className="h-[300px] flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                Formulário de Discovery (Em breve na Etapa 4)
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leads">
          <Card>
            <CardHeader>
              <CardTitle>Banco de Leads</CardTitle>
              <CardDescription>
                Todos os leads descobertos e persistidos no sistema.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px] flex items-center justify-center text-muted-foreground">
              Tabela de Leads (Em breve)
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Jobs</CardTitle>
              <CardDescription>
                Acompanhe o status das execuções de descoberta.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px] flex items-center justify-center text-muted-foreground">
              Lista de Jobs (Em breve)
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>Timeline Global</CardTitle>
              <CardDescription>
                Eventos recentes de descoberta e processamento.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px] flex items-center justify-center text-muted-foreground">
              Timeline de Auditoria (Em breve)
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

