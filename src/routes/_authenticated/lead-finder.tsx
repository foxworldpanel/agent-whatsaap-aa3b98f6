import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Radar, Search, Database, LayoutList, History, CheckCircle2, Play } from "lucide-react"
import { toast } from "sonner"

export const Route = createFileRoute('/_authenticated/lead-finder')({
  component: LeadFinderPage,
})

function LeadFinderPage() {
  const [provider, setProvider] = useState('mock')
  const [origin, setOrigin] = useState('profile')
  const [source, setSource] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  const handleStartDiscovery = () => {
    if (!source && provider === 'instagram_public') {
      toast.error("Por favor, informe a origem (ex: @username)")
      return
    }
    
    setIsSearching(true)
    toast.info(`Iniciando descoberta via ${provider === 'mock' ? 'Mock' : 'Instagram Public'}...`)
    
    // Simulating call to Discovery Engine / Job Service
    setTimeout(() => {
      setIsSearching(false)
      toast.success("Job de descoberta iniciado com sucesso!")
    }, 2000)
  }

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
          <TabsTrigger value="validation" className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Validation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="validation" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2 mb-4">
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-lg">Objetivo - Phase 1 Validation Sprint</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p>Não adicionar funcionalidades novas.</p>
                <p className="font-medium">Somente validar, testar e corrigir problemas da arquitetura da Fase 1.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">AI Independence</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2 text-muted-foreground">
                Desabilitar completamente o AI Service.
                Confirmar que Discovery, Persistência, Timeline e Jobs continuam funcionando.
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
...
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
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Provider</Label>
                <RadioGroup 
                  defaultValue="mock" 
                  value={provider} 
                  onValueChange={setProvider}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="mock" id="mock" />
                    <Label htmlFor="mock" className="font-normal cursor-pointer">Mock</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="instagram_public" id="instagram_public" />
                    <Label htmlFor="instagram_public" className="font-normal cursor-pointer">Instagram Public</Label>
                  </div>
                </RadioGroup>
              </div>

              {provider === 'instagram_public' && (
                <div className="space-y-6 pt-4 border-t animate-in fade-in duration-300">
                  <div className="space-y-3">
                    <Label>Origem</Label>
                    <RadioGroup 
                      defaultValue="profile" 
                      value={origin} 
                      onValueChange={setOrigin}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="profile" id="profile" />
                        <Label htmlFor="profile" className="font-normal cursor-pointer">Perfil</Label>
                      </div>
                      <div className="flex items-center space-x-2 opacity-50">
                        <RadioGroupItem value="hashtag" id="hashtag" disabled />
                        <Label htmlFor="hashtag" className="font-normal">Hashtag (Breve)</Label>
                      </div>
                      <div className="flex items-center space-x-2 opacity-50">
                        <RadioGroupItem value="keyword" id="keyword" disabled />
                        <Label htmlFor="keyword" className="font-normal">Palavra-chave (Breve)</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="source">Nome do Perfil</Label>
                    <Input 
                      id="source" 
                      placeholder="@sourcee" 
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      className="max-w-md"
                    />
                  </div>
                </div>
              )}

              {provider === 'mock' && (
                <div className="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground max-w-md">
                  O Mock Provider gera leads simulados para validação rápida da arquitetura e fluxos internos.
                </div>
              )}

              <div className="pt-4">
                <Button 
                  onClick={handleStartDiscovery} 
                  disabled={isSearching}
                  className="gap-2"
                >
                  <Play className="h-4 w-4" />
                  {isSearching ? "Iniciando..." : "Iniciar Discovery"}
                </Button>
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
