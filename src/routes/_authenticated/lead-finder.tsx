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
import type { 
  InstagramSessionInfo, 
  InstagramSessionStatus 
} from '@/lib/instagram-session/types'



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
    console.log('[LeadFinder] UI CLICK -> handleAddCredential');
    setIsSearching(true); // Reutilizando estado de loading para o botão
    
    const toastId = toast.loading("Iniciando conexão...", {
      description: "Verificando ambiente do servidor..."
    });

    try {
      console.log('[LeadFinder] Importing connectInstagramAction...');
      const { connectInstagramAction } = await import('@/lib/instagram-session/instagram-session.functions');
      
      toast.edit(toastId, {
        description: "Abrindo navegador... Aguarde o login no popup."
      });

      console.log('[LeadFinder] Calling connectInstagramAction...');
      const result = await connectInstagramAction();
      
      console.log('[LeadFinder] Result received:', result);
      
      if (result) {
        toast.success(`Conta @${result.username} conectada!`, { id: toastId });
        await loadCredentials();
      } else {
        toast.error("Conexão cancelada ou falhou.", { 
          id: toastId,
          description: "Verifique os logs do servidor para mais detalhes."
        });
      }
    } catch (e: any) {
      console.error('[LeadFinder] Error in handleAddCredential:', e);
      toast.error(`Erro na conexão`, {
        id: toastId,
        description: e.message || 'Erro desconhecido'
      });
    } finally {
      setIsSearching(false);
    }
  }

  const handleReconnect = async (id: string) => {
    try {
      toast.info("Abrindo navegador para reconexão...")
      const { reconnectInstagramAction } = await import('@/lib/instagram-session/instagram-session.functions')
      await reconnectInstagramAction({ data: { credentialId: id } })
      toast.success("Reconexão concluída")
      loadCredentials()
    } catch (e) {
      toast.error("Erro ao reconectar")
    }
  }

  const handleDisconnect = async (id: string) => {
    try {
      const { disconnectInstagramAction } = await import('@/lib/instagram-session/instagram-session.functions')
      await disconnectInstagramAction({ data: { credentialId: id } })
      toast.success("Sessão encerrada")
      loadCredentials()
    } catch (e) {
      toast.error("Erro ao desconectar")
    }
  }

  const handleRemoveCredential = async (id: string) => {
    try {
      const { removeInstagramAction } = await import('@/lib/instagram-session/instagram-session.functions')
      await removeInstagramAction({ data: { credentialId: id } })
      toast.success("Conta removida")
      loadCredentials()
    } catch (e) {
      toast.error("Erro ao remover conta")
    }
  }

  const handleValidate = async (id: string) => {
    try {
      const { validateInstagramAction } = await import('@/lib/instagram-session/instagram-session.functions')
      const status = await validateInstagramAction({ data: { credentialId: id } })
      toast.info(`Status da sessão: ${status}`)
      loadCredentials()
    } catch (error) {
      toast.error('Erro ao validar sessão')
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
                        <AvatarFallback>{cred.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <CardTitle className="text-base truncate">{cred.account_name}</CardTitle>
                        <CardDescription className="truncate">@{cred.username}</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Status</span>
                        <Badge variant={cred.status === 'connected' ? 'default' : cred.status === 'connecting' ? 'secondary' : 'destructive'} className="h-5 capitalize">
                          {cred.status?.replace('_', ' ') || 'Pendente'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Última sincronização</span>
                        <span>{cred.last_validation ? formatDistanceToNow(new Date(cred.last_validation), { addSuffix: true, locale: ptBR }) : 'Nunca'}</span>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs" onClick={() => handleReconnect(cred.id)}>
                          <RefreshCcw className="h-3 w-3" /> Reconectar
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs" onClick={() => handleValidate(cred.id)}>
                          Validar
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs" onClick={() => handleDisconnect(cred.id)}>
                          Desconectar
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
            <Card className="border-primary/20 bg-primary/5 col-span-full">
              <CardHeader>
                <CardTitle className="text-xl text-primary flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  Sprint 3.1 – Instagram Account Connection
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-4">
                <div className="bg-primary/10 p-4 rounded-lg border border-primary/20 mb-4">
                  <p className="font-bold text-primary">Objetivo</p>
                  <p className="text-xs mt-1">Implementar o primeiro fluxo funcional de conexão de contas do Instagram que será utilizado pelo Lead Finder. O foco desta sprint é exclusivamente o gerenciamento de sessões.</p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-bold">IMPORTANTE:</h4>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground list-disc pl-4">
                    <li>Não implementar Discovery, Hashtags, IA ou Sales Agent.</li>
                    <li>Não implementar extração de contatos.</li>
                    <li>Esta sprint não é de arquitetura, é de funcionalidade.</li>
                    <li>Ao final dela o sistema deve realmente permitir conectar e gerenciar uma conta.</li>
                    <li>Não criar mocks ou telas que apenas simulam estados.</li>
                    <li>Toda a autenticação deverá ser baseada apenas em sessão autenticada.</li>
                  </ul>
                </div>
                
                <div className="space-y-2 pt-2">
                  <h4 className="font-bold">Fluxo esperado:</h4>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-muted p-2 rounded justify-center">
                    <span>Lead Finder</span>
                    <Play className="h-2 w-2" />
                    <span>Accounts</span>
                    <Play className="h-2 w-2" />
                    <span>Conectar Conta</span>
                    <Play className="h-2 w-2" />
                    <span>Autenticação</span>
                    <Play className="h-2 w-2" />
                    <span>Sessão salva</span>
                    <Play className="h-2 w-2" />
                    <span className="text-primary font-bold">Status = Connected</span>
                  </div>
                </div>

                <div className="bg-muted p-3 rounded border text-[11px] italic text-center mt-2">
                  Nenhum outro módulo poderá alterar diretamente uma sessão. Criar um Session Manager responsável exclusivamente por criar, validar, renovar, remover e informar status.
                </div>



                <div className="space-y-2 pt-2 border-t border-primary/10">
                  <h4 className="font-bold">1 - Accounts (Centro de Gerenciamento):</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1"><span>• Foto/Nome/User</span></div>
                    <div className="flex items-center gap-1"><span>• Status Real</span></div>
                    <div className="flex items-center gap-1"><span>• Última Utilização</span></div>
                    <div className="flex items-center gap-1"><span>• Sincronização</span></div>
                  </div>
                </div>

                <div className="bg-background/50 p-4 rounded-lg border border-primary/10 mt-4">
                  <p className="font-medium text-primary text-xs text-center">Sprint 3.1: Entregar uma funcionalidade operacional de sessão. Toda alteração deve resultar em um fluxo utilizável pelo operador.</p>
                </div>

                <div className="space-y-3 mt-4">
                  <h4 className="font-bold flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-3 w-3 text-primary" />
                    Critérios de Aceite
                  </h4>
                  <ul className="text-[10px] text-muted-foreground space-y-1 list-disc pl-4">
                    <li>Possível adicionar, conectar, desconectar, reconectar e remover contas.</li>
                    <li>Visualização correta do status real (Never Connected, Connecting, Connected, Expired, Disconnected, Error).</li>
                    <li>Discovery reconhecer e listar apenas contas com status Connected.</li>
                    <li>Toda ação deve registrar eventos para a Timeline (Logs).</li>
                  </ul>
                </div>

              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ValidationItem 
              title="1 - Accounts & Estados" 
              description="A aba Accounts será o centro. Implementar estados reais sincronizados."
              checks={["Never Connected, Connected, Expired, Disconnected", "Ações válidas por estado (Conectar/Desconectar)", "Refletir estado real, sem alteração manual"]}
            />
            <ValidationItem 
              title="2 - Fluxo de Conexão" 
              description="Fluxo oficial de autenticação preparando automação futura."
              checks={["Camada de controle de sessões pronta", "Não armazenar usuário/senha permanentemente", "Autenticação baseada apenas em sessão"]}
            />
            <ValidationItem 
              title="3 - Session Manager" 
              description="Serviço responsável exclusivamente pelas sessões."
              checks={["Criar, Validar, Renovar e Remover sessões", "Centralização: nenhum outro módulo altera sessão", "Informar status em tempo real"]}
            />
            <ValidationItem 
              title="4 - Banco de Dados" 
              description="Garantir suporte completo na tabela de credenciais."
              checks={["username, profile_picture, status", "last_login, last_validation, last_used", "Sem armazenamento de tokens permanentes"]}
            />
            <ValidationItem 
              title="5 - Discovery & Logs" 
              description="Integração com Discovery e rastreabilidade total."
              checks={["Discovery lista apenas contas Connected", "Logs: Conta criada/conectada/expirada", "Base para Timeline futura"]}
            />
            <ValidationItem 
              title="6 - Lead Bank & Jobs" 
              description="Persistência e monitoramento automático."
              checks={["Lead aparece sem atualizar", "Job, Timeline e Estatísticas", "duração, encontrados, erros, duplicados"]}
            />
          </div>

          <Card className="mt-4 border-dashed bg-muted/20">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">Critérios de aceite</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground grid md:grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-primary" />
                <span>seja possível conectar uma conta do Instagram;</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-primary" />
                <span>seja possível iniciar uma descoberta utilizando essa conta;</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-primary" />
                <span>um perfil público possa ser lido;</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-primary" />
                <span>os contatos públicos sejam extraídos corretamente quando existirem;</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-primary" />
                <span>o Lead seja salvo no Lead Bank;</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-primary" />
                <span>Jobs e Timeline sejam atualizados automaticamente;</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-primary" />
                <span>a deduplicação continue funcionando.</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discovery">
          {activeJob ? (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-primary flex items-center gap-2">
                      <Play className="h-4 w-4 animate-pulse" />
                      Discovery Running
                    </CardTitle>
                    <CardDescription>
                      {activeJob.provider_id} • {credentials.find(c => c.id === activeJob.config?.credential_id)?.username || 'Mock'}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-background">Executando</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase">Status</p>
                    <p className="text-xl font-bold">Executando</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase">Perfis analisados</p>
                    <p className="text-xl font-bold">{activeJob.stats?.profiles_analyzed || 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase">Leads encontrados</p>
                    <p className="text-xl font-bold">{activeJob.stats?.leads || 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase">Duplicados</p>
                    <p className="text-xl font-bold">{activeJob.stats?.duplicates || 0}</p>
                  </div>
                </div>
                <Separator className="my-6" />
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Instagram className="h-3 w-3" />
                    <span>@{activeJob.config?.username || 'sourcee'}</span>
                  </div>
                  <span>Iniciado há poucos segundos</span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Nova Descoberta</CardTitle>
                    <CardDescription>
                      Transforme fontes sociais em leads qualificados.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-8">
                    {/* Step 1: Source */}
                    <div className="space-y-4">
                      <Label className="text-base font-bold">1. Fonte</Label>
                      <RadioGroup 
                        value={provider} 
                        onValueChange={(v: any) => setProvider(v)}
                        className="grid grid-cols-2 md:grid-cols-3 gap-4"
                      >
                        <div className="flex items-center space-x-2 border p-3 rounded-lg cursor-pointer hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5 transition-colors">
                          <RadioGroupItem value="instagram_public" id="src-ig" className="sr-only" />
                          <Label htmlFor="src-ig" className="flex items-center gap-2 cursor-pointer w-full font-medium">
                            <Instagram className="h-5 w-5 text-[#E4405F]" /> Instagram
                          </Label>
                        </div>
                        
                        <div className="flex items-center space-x-2 border p-3 rounded-lg opacity-50 cursor-not-allowed bg-muted/20">
                          <RadioGroupItem value="tiktok" id="src-tt" className="sr-only" disabled />
                          <Label htmlFor="src-tt" className="flex flex-col gap-0.5 w-full">
                            <span className="font-medium text-sm">TikTok</span>
                            <span className="text-[10px] text-muted-foreground">Em breve</span>
                          </Label>
                        </div>

                        <div className="flex items-center space-x-2 border p-3 rounded-lg opacity-50 cursor-not-allowed bg-muted/20">
                          <RadioGroupItem value="youtube" id="src-yt" className="sr-only" disabled />
                          <Label htmlFor="src-yt" className="flex flex-col gap-0.5 w-full">
                            <span className="font-medium text-sm">YouTube</span>
                            <span className="text-[10px] text-muted-foreground">Em breve</span>
                          </Label>
                        </div>

                        <div className="flex items-center space-x-2 border p-3 rounded-lg cursor-pointer hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5 transition-colors">
                          <RadioGroupItem value="mock" id="src-mock" className="sr-only" />
                          <Label htmlFor="src-mock" className="flex items-center gap-2 cursor-pointer w-full font-medium">
                            <Terminal className="h-5 w-5 text-primary" /> Mock Data
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {/* Step 2: Account */}
                    {provider !== 'mock' && (
                      <div className="space-y-4">
                        <Label className="text-base font-bold">2. Conta</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {credentials.map(cred => (
                            <div 
                              key={cred.id}
                              onClick={() => setSelectedCredential(cred.id)}
                              className={`flex items-center gap-3 border p-3 rounded-lg cursor-pointer hover:bg-muted/50 transition-all ${selectedCredential === cred.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}
                            >
                              <Avatar className="h-8 w-8 border">
                                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${cred.username}`} />
                                <AvatarFallback>{cred.username?.[0] || 'U'}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1 overflow-hidden">
                                <p className="text-sm font-medium truncate">{cred.account_name}</p>
                                <p className="text-[10px] text-muted-foreground truncate">@{cred.username}</p>
                              </div>
                              {selectedCredential === cred.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                            </div>
                          ))}
                          <Button variant="outline" onClick={handleAddCredential} className="h-auto py-3 border-dashed gap-2 justify-start px-4">
                            <Plus className="h-4 w-4" />
                            <span className="text-sm">Nova Conta</span>
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Type */}
                    <div className="space-y-4">
                      <Label className="text-base font-bold">3. Tipo de descoberta</Label>
                      <RadioGroup 
                        value={discoveryType} 
                        onValueChange={(v: any) => setDiscoveryType(v)}
                        className="grid grid-cols-1 md:grid-cols-3 gap-3"
                      >
                        <div className="flex items-center space-x-2 border p-3 rounded-lg cursor-pointer hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                          <RadioGroupItem value="profile" id="type-prof" className="sr-only" />
                          <Label htmlFor="type-prof" className="w-full cursor-pointer text-sm font-medium">Perfil</Label>
                        </div>
                        <div className="flex items-center space-x-2 border p-3 rounded-lg opacity-50 bg-muted/20">
                          <RadioGroupItem value="hashtag" id="type-hash" className="sr-only" disabled />
                          <Label htmlFor="type-hash" className="flex flex-col gap-0.5 w-full">
                            <span className="text-sm font-medium">Hashtag</span>
                            <span className="text-[10px] text-muted-foreground">Em breve</span>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2 border p-3 rounded-lg opacity-50 bg-muted/20">
                          <RadioGroupItem value="keyword" id="type-key" className="sr-only" disabled />
                          <Label htmlFor="type-key" className="flex flex-col gap-0.5 w-full">
                            <span className="text-sm font-medium">Palavra-chave</span>
                            <span className="text-[10px] text-muted-foreground">Em breve</span>
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {/* Step 4: Params */}
                    <div className="space-y-6">
                      <Label className="text-base font-bold">4. Parâmetros</Label>
                      <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="username" className="text-xs uppercase text-muted-foreground">@usuario do Instagram</Label>
                          <Input 
                            id="username" 
                            placeholder="@username" 
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="h-10"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs uppercase text-muted-foreground">Limite de Leads</Label>
                          <div className="flex gap-2">
                            {['10', '25', '50', '100'].map(val => (
                              <Button 
                                key={val} 
                                variant={limit === val ? 'default' : 'outline'} 
                                size="sm" 
                                className="flex-1"
                                onClick={() => setLimit(val)}
                              >
                                {val}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-6">
                      <Button onClick={handleStartDiscovery} disabled={isSearching} className="flex-1 h-12 text-base gap-2">
                        <Play className="h-5 w-5" />
                        {isSearching ? "Buscando..." : "Iniciar Discovery"}
                      </Button>
                      
                      <Button variant="outline" onClick={handleRunIntegrationTest} disabled={isRunningTest} className="h-12 px-6">
                        <Terminal className="h-5 w-5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card className="bg-muted/30">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      Como funciona
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-4 text-muted-foreground leading-relaxed">
                    <p>O Lead Finder utiliza inteligência de dados públicos para encontrar perfis que correspondem aos seus critérios.</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>Respeita limites de plataforma</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>Extração de e-mail e telefone públicos</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>Deduplicação automática inteligente</span>
                      </div>
                    </div>
                    <Separator />
                    <p className="font-medium text-foreground">Sprint 2.1 Focus:</p>
                    <p>Nesta fase estamos otimizando a interface e o gerenciamento de contas. O scraping real por hashtags será liberado na Sprint 3.0.</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="leads">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Lead Bank</CardTitle>
                <CardDescription>Visualize e gerencie todos os leads descobertos.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" /> Filtros
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                  <Database className="h-4 w-4" /> Exportar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-[300px]">Lead</TableHead>
                      <TableHead>Localização</TableHead>
                      <TableHead>Contatos</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Temperatura</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                          Nenhum lead encontrado ainda. Inicie uma descoberta para começar.
                        </TableCell>
                      </TableRow>
                    ) : (
                      leads.map((lead) => (
                        <TableRow key={lead.id} className="hover:bg-muted/20 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10 border shadow-sm">
                                <AvatarImage src={lead.profile_pic_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${lead.username}`} />
                                <AvatarFallback>{lead.username?.[0] || 'U'}</AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col">
                                <span className="font-semibold text-sm leading-none">{lead.full_name || lead.username}</span>
                                <span className="text-xs text-muted-foreground">@{lead.username || 'unknown'}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1">
                              <Globe className="h-3 w-3 text-muted-foreground" />
                              {lead.location || 'Brasil'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {lead.email && (
                                <Badge variant="secondary" className="h-5 px-1 bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400">
                                  <Mail className="h-3 w-3" />
                                </Badge>
                              )}
                              {lead.phone && (
                                <Badge variant="secondary" className="h-5 px-1 bg-green-50 text-green-700 border-green-100 dark:bg-green-900/20 dark:text-green-400">
                                  <Phone className="h-3 w-3" />
                                </Badge>
                              )}
                              {lead.website && (
                                <Badge variant="secondary" className="h-5 px-1 bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/20 dark:text-purple-400">
                                  <Globe className="h-3 w-3" />
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className="h-6 font-normal capitalize" variant="outline">
                              {lead.sales_status?.replace('_', ' ') || 'New'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-orange-500" 
                                  style={{ width: `${(lead.score_profile || 0) * 100}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-orange-600">
                                {Math.round((lead.score_profile || 0) * 100)}°
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Sheet>
                              <SheetTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedLead(lead)}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </SheetTrigger>
                              <SheetContent className="w-[400px] sm:w-[540px]">
                                <SheetHeader>
                                  <div className="flex items-center gap-4 pt-4">
                                    <Avatar className="h-16 w-16 border-2 border-primary/20">
                                      <AvatarImage src={lead.profile_pic_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${lead.username}`} />
                                      <AvatarFallback>{lead.username?.[0] || 'U'}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <SheetTitle className="text-2xl">{lead.full_name || lead.username}</SheetTitle>
                                      <SheetDescription className="text-primary font-medium">@{lead.username}</SheetDescription>
                                    </div>
                                  </div>
                                </SheetHeader>

                                <div className="mt-8 space-y-6">
                                  <div className="grid grid-cols-2 gap-4">
                                    <Card className="bg-muted/30 border-none shadow-none">
                                      <CardContent className="p-4 space-y-1">
                                        <p className="text-[10px] uppercase text-muted-foreground font-bold">Temperatura</p>
                                        <p className="text-2xl font-black text-orange-600">{Math.round((lead.score_profile || 0) * 100)}°</p>
                                      </CardContent>
                                    </Card>
                                    <Card className="bg-muted/30 border-none shadow-none">
                                      <CardContent className="p-4 space-y-1">
                                        <p className="text-[10px] uppercase text-muted-foreground font-bold">Seguidores</p>
                                        <p className="text-2xl font-black">--</p>
                                      </CardContent>
                                    </Card>
                                  </div>

                                  <div className="space-y-4">
                                    <h4 className="text-sm font-bold flex items-center gap-2">
                                      <Info className="h-4 w-4" /> Informações de Contato
                                    </h4>
                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between text-sm p-3 border rounded-lg bg-background">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                          <Mail className="h-4 w-4" /> E-mail
                                        </div>
                                        <span className="font-medium">{lead.email || 'Não encontrado'}</span>
                                      </div>
                                      <div className="flex items-center justify-between text-sm p-3 border rounded-lg bg-background">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                          <Phone className="h-4 w-4" /> Telefone
                                        </div>
                                        <span className="font-medium">{lead.phone || 'Não encontrado'}</span>
                                      </div>
                                      <div className="flex items-center justify-between text-sm p-3 border rounded-lg bg-background">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                          <Globe className="h-4 w-4" /> Website
                                        </div>
                                        {lead.website ? (
                                          <a href={lead.website} target="_blank" className="text-primary hover:underline flex items-center gap-1 font-medium">
                                            Visitar site <ExternalLink className="h-3 w-3" />
                                          </a>
                                        ) : (
                                          <span className="text-muted-foreground">Não informado</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    <h4 className="text-sm font-bold">Biografia</h4>
                                    <p className="text-sm text-muted-foreground bg-muted/20 p-4 rounded-lg italic">
                                      {lead.bio || "Nenhuma biografia extraída."}
                                    </p>
                                  </div>

                                  <div className="flex gap-2 pt-4">
                                    <Button className="flex-1 gap-2 h-12">
                                      <Send className="h-4 w-4" /> Iniciar Abordagem
                                    </Button>
                                    <Button variant="outline" size="icon" className="h-12 w-12 text-destructive border-destructive/20">
                                      <Trash2 className="h-5 w-5" />
                                    </Button>
                                  </div>
                                </div>
                              </SheetContent>
                            </Sheet>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <CardTitle>Discovery History</CardTitle>
              <CardDescription>
                Acompanhe o status e performance das execuções.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Job ID</TableHead>
                      <TableHead>Configuração</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Leads</TableHead>
                      <TableHead>Iniciado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                          Nenhum job registrado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      jobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="font-mono text-[10px]">{job.id.substring(0, 8)}...</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-medium uppercase">{job.provider_id}</span>
                              <span className="text-[10px] text-muted-foreground">@{job.config?.username || 'mock'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize text-[10px] h-5">
                              {job.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-bold">{job.stats?.leads || 0}</TableCell>
                          <TableCell className="text-[10px]">
                            {formatDistanceToNow(new Date(job.created_at), { addSuffix: true, locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <History className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>Timeline Operacional</CardTitle>
              <CardDescription>Audit trail do DiscoveryEngine.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-4">
                  {leads.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground">
                      Nenhum evento registrado.
                    </div>
                  ) : (
                    leads.slice(0, 20).map((lead, idx) => (
                      <div key={idx} className="flex gap-4 items-start">
                        <div className="mt-1 h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Database className="h-3 w-3 text-primary" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm">
                            <span className="font-bold">Lead Persistido:</span> {lead.full_name || lead.username || 'unknown'} (@{lead.username || 'unknown'})
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Provider: {lead.source_provider} • Score: {Math.round((lead.score_profile || 0) * 100)}%
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true, locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="validation" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight text-destructive">Sprint 3.0 – Pendente (Funcionalidade Real)</h2>
            <Badge variant="destructive" className="gap-1">
              <Info className="h-3 w-3" /> Sprint Incompleta
            </Badge>



          </div>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <ValidationItem 
              title="1 - Conexão Operacional" 
              description="Conta do Instagram conectada e pronta para requisições reais."
              checks={["Sessão ativa e válida", "Bypass de simulação mock", "Uso de credenciais reais"]}
            />
            <ValidationItem 
              title="2 - Scraper de Hashtag" 
              description="Capacidade de extrair perfis a partir de uma hashtag informada."
              checks={["Input #hashtag funcional", "Paginação de resultados", "Identificação de perfis únicos"]}
            />
            <ValidationItem 
              title="3 - Extração de Contatos" 
              description="Leitura de informações públicas (Bio, Links, WhatsApp)."
              checks={["WhatsApp/Telefone extraído", "E-mail extraído", "Website/Links capturados"]}
            />
            <ValidationItem 
              title="4 - LeadDiscoveryResult" 
              description="Padronização do objeto de lead para o motor do sistema."
              checks={["Objeto completo e tipado", "Fallback para campos vazios", "Score básico de validade"]}
            />
            <ValidationItem 
              title="5 - Persistência Real" 
              description="Escrita no banco de leads via LeadService."
              checks={["Gravação no PostgreSQL", "Deduplicação funcional", "Audit trail na Timeline"]}
            />
            <ValidationItem 
              title="6 - Job & Stats" 
              description="Controle de execução e métricas reais de descoberta."
              checks={["Contagem de perfis analisados", "Contagem de leads com contato", "Tempo total de execução"]}
            />


          </div>
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
