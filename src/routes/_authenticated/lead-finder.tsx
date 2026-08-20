import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { 
  Radar, Search, Database, LayoutList, History, CheckCircle2, 
  Play, Instagram, Terminal, Plus, RefreshCcw, Trash2, 
  ExternalLink, User, MessageSquare, Phone, Mail, Globe, 
  Info, Filter, MoreHorizontal, Eye, Send
} from "lucide-react"
import { discoveryEngine } from '@/lib/lead-finder/discovery-engine'
import { toast } from 'sonner'
import { runLeadFinderIntegrationTest } from '@/lib/lead-finder/test-integration'
import { CredentialService } from '@/lib/lead-finder/credential.service'
import { LeadService } from '@/lib/lead-finder/lead.service'
import { JobService } from '@/lib/lead-finder/job.service'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const Route = createFileRoute('/_authenticated/lead-finder')({
  component: LeadFinderPage,
})

function LeadFinderPage() {
  const [provider, setProvider] = useState<'mock' | 'instagram_public'>('instagram_public')
  const [username, setUsername] = useState('')
  const [limit, setLimit] = useState('25')
  const [discoveryType, setDiscoveryType] = useState<'profile' | 'hashtag' | 'keyword'>('profile')
  const [isSearching, setIsSearching] = useState(false)
  const [isRunningTest, setIsRunningTest] = useState(false)
  
  const [credentials, setCredentials] = useState<any[]>([])
  const [selectedCredential, setSelectedCredential] = useState<string>('')
  
  const [leads, setLeads] = useState<any[]>([])
  const [selectedLead, setSelectedLead] = useState<any>(null)
  
  const [jobs, setJobs] = useState<any[]>([])
  const [activeJob, setActiveJob] = useState<any>(null)
  
  const [timeline, setTimeline] = useState<any[]>([])

  useEffect(() => {
    loadCredentials()
    loadLeads()
    loadJobs()
  }, [])

  const loadCredentials = async () => {
    try {
      const data = await CredentialService.listCredentials()
      setCredentials(data)
      if (data.length > 0) setSelectedCredential(data[0].id)
    } catch (e) {
      console.error(e)
    }
  }

  const loadLeads = async () => {
    try {
      const data = await LeadService.listLeads()
      setLeads(data)
    } catch (e) {
      console.error(e)
    }
  }

  const loadJobs = async () => {
    try {
      const data = await JobService.listJobs()
      setJobs(data)
    } catch (e) {
      console.error(e)
    }
  }

  const handleStartDiscovery = async () => {
    if (provider === 'instagram_public' && !username) {
      toast.error("Informe um username do Instagram")
      return
    }

    if (!selectedCredential && provider !== 'mock') {
      toast.error("Selecione uma conta para a descoberta")
      return
    }

    setIsSearching(true)
    try {
      // 1. Create Job
      const job = await JobService.createJob(provider, { 
        username, 
        limit: parseInt(limit), 
        credential_id: selectedCredential,
        type: discoveryType
      })
      setActiveJob(job)
      loadJobs()

      // 2. Start Provider Run
      const run = await JobService.startRun(job.id, provider, selectedCredential)

      // 3. Execution (Provider call)
      const activeProvider = discoveryEngine.getProvider(provider)
      if (!activeProvider) throw new Error("Provider não registrado")

      const query = provider === 'instagram_public' 
        ? { type: 'profile', username, limit: parseInt(limit) } 
        : { limit: parseInt(limit) }

      const results = await activeProvider.search(query)
      
      // 4. Persistence via LeadService (Engine calls this normally, but here we do it for simplicity in Phase 2)
      for (const res of results) {
        await LeadService.saveLead(res, provider, username || 'mock')
        await JobService.updateStats(job.id, { leads: 1, profiles_analyzed: 1 })
      }

      // 5. Finish Run & Job
      await JobService.finishRun(run.id)
      
      toast.success(`Descoberta finalizada! ${results.length} leads encontrados.`)
      loadLeads()
      loadJobs()
      setActiveJob(null)
    } catch (error) {
      console.error(error)
      toast.error("Erro na descoberta")
    } finally {
      setIsSearching(false)
    }
  }

  const handleRunIntegrationTest = async () => {
    setIsRunningTest(true)
    toast.info("Iniciando teste de integração completo...")
    try {
      const results = await runLeadFinderIntegrationTest()
      const allSuccess = results.every(r => r.success)
      if (allSuccess) {
        toast.success("Teste de integração concluído com sucesso!")
      } else {
        toast.error("Falha em alguns testes de integração")
      }
      loadLeads()
      loadJobs()
    } catch (error) {
      toast.error("Erro ao executar teste")
    } finally {
      setIsRunningTest(false)
    }
  }

  const handleAddCredential = async () => {
    try {
      await CredentialService.addCredential({
        provider_type: 'instagram',
        account_name: 'Conta Principal',
        username: 'sourcee_oficial',
        config: {}
      })
      toast.success("Conta conectada com sucesso!")
      loadCredentials()
    } catch (e) {
      toast.error("Erro ao conectar conta")
    }
  }

  const handleRemoveCredential = async (id: string) => {
    try {
      await CredentialService.removeCredential(id)
      toast.success("Conta removida")
      loadCredentials()
    } catch (e) {
      toast.error("Erro ao remover conta")
    }
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
        <TabsList className="grid w-full grid-cols-6 lg:w-[900px]">
          <TabsTrigger value="accounts" className="flex items-center gap-2">
            <Instagram className="h-4 w-4" />
            Accounts
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
          <TabsTrigger value="validation" className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Validation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <div className="grid gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">Instagram Accounts</h3>
                <p className="text-sm text-muted-foreground">Gerencie as contas utilizadas para descoberta.</p>
              </div>
              <Button onClick={handleAddCredential} className="gap-2">
                <Plus className="h-4 w-4" />
                Conectar Conta
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {credentials.length === 0 ? (
                <Card className="col-span-full border-dashed p-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Instagram className="h-8 w-8 text-muted-foreground/50" />
                    <p className="text-muted-foreground">Nenhuma conta conectada ainda.</p>
                    <Button variant="link" onClick={handleAddCredential}>+ Conectar sua primeira conta</Button>
                  </div>
                </Card>
              ) : (
                credentials.map(cred => (
                  <Card key={cred.id}>
                    <CardHeader className="flex flex-row items-center gap-4 pb-2">
                      <Avatar className="h-12 w-12 border">
                        <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${cred.username}`} />
                        <AvatarFallback>{cred.username[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <CardTitle className="text-base truncate">{cred.account_name}</CardTitle>
                        <CardDescription className="truncate">@{cred.username}</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Status</span>
                        <Badge variant={cred.status === 'connected' ? 'default' : 'destructive'} className="h-5">
                          {cred.status === 'connected' ? 'Conectada' : cred.status === 'expired' ? 'Expirada' : 'Desconectada'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Última sincronização</span>
                        <span>{cred.last_sync ? formatDistanceToNow(new Date(cred.last_sync), { addSuffix: true, locale: ptBR }) : 'Nunca'}</span>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs">
                          <RefreshCcw className="h-3 w-3" /> Reconectar
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveCredential(cred.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </TabsContent>

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
              <div className="space-y-4">
                <Label>Provider</Label>
                <RadioGroup 
                  value={provider} 
                  onValueChange={(v: any) => setProvider(v)}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="instagram_public" id="ig" />
                    <Label htmlFor="ig" className="flex items-center gap-2 cursor-pointer">
                      <Instagram className="h-4 w-4" /> Instagram Public
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="mock" id="mock" />
                    <Label htmlFor="mock" className="flex items-center gap-2 cursor-pointer">
                      <Terminal className="h-4 w-4" /> Mock Provider
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {provider === 'instagram_public' && (
                <div className="space-y-2 max-w-sm">
                  <Label htmlFor="username">Username do Instagram</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="username" 
                      placeholder="@username" 
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {provider === 'mock' && (
                <div className="p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground border">
                  O Mock Provider gera dados aleatórios para teste de pipeline.
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button onClick={handleStartDiscovery} disabled={isSearching} className="gap-2">
                  <Play className="h-4 w-4" />
                  {isSearching ? "Buscando..." : "Iniciar Discovery"}
                </Button>
                
                <Button variant="outline" onClick={handleRunIntegrationTest} disabled={isRunningTest} className="gap-2">
                  <Terminal className="h-4 w-4" />
                  Rodar Teste de Integração
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
