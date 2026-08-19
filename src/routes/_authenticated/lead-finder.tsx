import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Radar, Search, Database, LayoutList, History, CheckCircle2 } from "lucide-react"

export const Route = createFileRoute('/_authenticated/lead-finder')({
  component: LeadFinderPage,
})

function LeadFinderPage() {
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
        <TabsList className="grid w-full grid-cols-5 lg:w-[750px]">
          <TabsTrigger value="validation" className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Checklist
          </TabsTrigger>
          <TabsTrigger value="discovery" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Discovery
          </TabsTrigger>
          <TabsTrigger value="leads" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Leads
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

        <TabsContent value="validation" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ValidationItem 
              title="1. Deduplicação" 
              description="Executar o Mock Provider duas ou mais vezes com os mesmos leads."
              checks={[
                "Nenhum lead duplicado é criado",
                "Timeline não duplica eventos",
                "Jobs registram corretamente"
              ]}
            />
            <ValidationItem 
              title="2. Provider Contract" 
              description="Garantir que providers sejam puros (sem DB, IA ou Sales Agent)."
              checks={[
                "Sem INSERT/UPDATE/DELETE direto",
                "Acesso ao banco proibido",
                "Retorno exclusivo LeadDiscoveryResult"
              ]}
            />
            <ValidationItem 
              title="3. DiscoveryEngine" 
              description="Validar flexibilidade e desacoplamento de providers."
              checks={[
                "Aceita múltiplos providers",
                "Independente do Mock Provider",
                "Troca sem alteração de código"
              ]}
            />
            <ValidationItem 
              title="4. LeadService" 
              description="Validar centralização da persistência."
              checks={[
                "Single source of truth para escrita",
                "Deduplicação centralizada",
                "Gestão de estado de leads"
              ]}
            />
            <ValidationItem 
              title="6. Timeline" 
              description="Fluxo: Discovered → Persisted → Job Registered → Finished."
              checks={[
                "Eventos em ordem lógica",
                "Sem duplicidade de logs",
                "Dados de contexto preservados"
              ]}
            />
            <ValidationItem 
              title="7. Jobs" 
              description="Validar transições de estados de execução."
              checks={[
                "RUNNING → FINISHED",
                "Tratamento de FAILED",
                "Logs de erro capturados"
              ]}
            />
          </div>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-lg">8. Relatório Final</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Entregar ao final desta sprint o resultado de cada teste, problemas encontrados, correções e a confirmação dos Success Criteria da Fase 1.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discovery">
          <Card>
            <CardHeader>
              <CardTitle>Nova Descoberta</CardTitle>
              <CardDescription>
                Configure os parâmetros para encontrar novos leads.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px] flex items-center justify-center text-muted-foreground">
              Formulário de Discovery (Em breve na Etapa 4)
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

function ValidationItem({ title, description, checks }: { title: string, description: string, checks: string[] }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="space-y-1.5 mt-2">
          {checks.map((check, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/40 shrink-0" />
              {check}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
