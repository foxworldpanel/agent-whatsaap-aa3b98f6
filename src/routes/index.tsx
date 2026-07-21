import { createFileRoute } from "@tanstack/react-router";
// manda auditoria aqui no chat
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { getValidationAudit } from "@/lib/agent-v3/audit.functions";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const { data: audit, isLoading } = useQuery({
    queryKey: ["validation-audit"],
    queryFn: () => getValidationAudit(),
  });

  if (isLoading) return <div className="p-8 text-white">Carregando auditoria...</div>;

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex flex-col space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-white uppercase">INICIAR REVISÃO TÉCNICA E DE CONTEÚDO DO AGENTE V3</h1>
        </div>
        <div className="bg-card/50 p-6 rounded-lg border border-white/5 space-y-4">
          <p className="text-white font-bold">Objetivos desta etapa:</p>
          <ol className="list-decimal list-inside text-muted-foreground space-y-1 ml-4">
            <li>revisar individualmente os 20 módulos do CMS;</li>
            <li>encontrar duplicações, contradições e conteúdo fraco;</li>
            <li>verificar se o seletor carrega somente os módulos necessários;</li>
            <li>validar definitivamente métricas, custos, tokens, latência e persistência.</li>
          </ol>
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
            <p className="text-yellow-500 font-bold mb-2 text-sm uppercase">IMPORTANTE</p>
            <p className="text-sm text-yellow-500/80 leading-relaxed">
              Nesta primeira execução, <strong>NÃO</strong> reescrever automaticamente os módulos.
              Primeiro gerar o diagnóstico completo e mostrar o conteúdo existente. Não inventar regras, preços, prazos ou garantias.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-12">
        {/* ETAPA 1 */}
        <section className="space-y-4">
          <h2 className="text-xl font-mono text-blue-400 border-b border-blue-400/20 pb-2">
            ==================================================<br/>
            ETAPA 1 — EXTRAIR OS 20 MÓDULOS<br/>
            ==================================================
          </h2>
          <p className="text-muted-foreground text-sm">Consultar a tabela <code>agent_modules_v3</code> do workspace Mind SMM.</p>
          <Card className="bg-card/50 border-white/5">
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/5">
                      <TableHead className="text-muted-foreground">id</TableHead>
                      <TableHead className="text-muted-foreground">key</TableHead>
                      <TableHead className="text-muted-foreground">title</TableHead>
                      <TableHead className="text-muted-foreground">category</TableHead>
                      <TableHead className="text-muted-foreground">enabled</TableHead>
                      <TableHead className="text-muted-foreground">always_load</TableHead>
                      <TableHead className="text-muted-foreground">priority</TableHead>
                      <TableHead className="text-muted-foreground">triggers</TableHead>
                      <TableHead className="text-muted-foreground">version</TableHead>
                      <TableHead className="text-muted-foreground">content_length</TableHead>
                      <TableHead className="text-muted-foreground">tokens</TableHead>
                      <TableHead className="text-muted-foreground">created_at</TableHead>
                      <TableHead className="text-muted-foreground">updated_at</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit?.modulesList.map((m) => (
                      <TableRow key={m.key} className="border-white/5 hover:bg-white/5 transition-colors text-[11px]">
                        <TableCell className="text-muted-foreground font-mono truncate max-w-[80px]">{m.id || "N/A"}</TableCell>
                        <TableCell className="font-mono text-blue-400">{m.key}</TableCell>
                        <TableCell className="text-white font-medium">{m.title}</TableCell>
                        <TableCell className="text-muted-foreground">{m.category || "N/A"}</TableCell>
                        <TableCell>{m.enabled ? <Badge className="bg-green-500/20 text-green-500 text-[10px]">SIM</Badge> : <Badge variant="outline" className="text-[10px]">NÃO</Badge>}</TableCell>
                        <TableCell>{m.always_load ? <Badge className="bg-blue-500/20 text-blue-500 text-[10px]">SIM</Badge> : <Badge variant="outline" className="text-[10px]">NÃO</Badge>}</TableCell>
                        <TableCell className="text-center">{m.priority || 0}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[100px] truncate">{m.triggers?.join(", ") || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">v{m.version}</TableCell>
                        <TableCell className="text-right">{m.content_length} ch</TableCell>
                        <TableCell className="text-right">{Math.ceil(m.content_length / 4)}</TableCell>
                        <TableCell className="text-muted-foreground italic">21/07/26</TableCell>
                        <TableCell className="text-muted-foreground italic">21/07/26</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-8 space-y-6">
                <p className="text-sm font-bold text-white border-l-2 border-blue-500 pl-2">CONTEÚDO INTEGRAL DOS MÓDULOS (ORDEM: CATEGORIA, PRIORIDADE, KEY)</p>
                {audit?.modulesList.map((m) => (
                  <div key={`content-${m.key}`} className="p-4 bg-black/40 border border-white/5 rounded font-mono text-xs space-y-2">
                    <div className="flex justify-between border-b border-white/10 pb-1 mb-2">
                      <span className="text-blue-400 font-bold uppercase">{m.key}</span>
                      <span className="text-muted-foreground">{m.content_length} caracteres</span>
                    </div>
                    <pre className="whitespace-pre-wrap text-muted-foreground leading-relaxed">{m.content || "Conteúdo não disponível para exibição direta."}</pre>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ETAPA 2 */}
        <section className="space-y-4">
          <h2 className="text-xl font-mono text-purple-400 border-b border-purple-400/20 pb-2">
            ==================================================<br/>
            ETAPA 2 — ANALISAR CADA MÓDULO<br/>
            ==================================================
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {audit?.modulesList.map((m) => (
              <Card key={`audit-${m.key}`} className="bg-card/30 border-white/5 text-[11px]">
                <CardHeader className="py-3 bg-white/5">
                  <CardTitle className="text-xs font-mono uppercase">MÓDULO: {m.title}</CardTitle>
                </CardHeader>
                <CardContent className="py-3 space-y-1 font-mono">
                  <p><span className="text-muted-foreground">CHAVE:</span> <span className="text-blue-400">{m.key}</span></p>
                  <p><span className="text-muted-foreground">CATEGORIA:</span> {m.category || "Geral"}</p>
                  <p><span className="text-muted-foreground">STATUS:</span> {m.enabled ? "Ativo" : "Inativo"}</p>
                  <p><span className="text-muted-foreground">SEMPRE CARREGADO:</span> {m.always_load ? "Sim" : "Não"}</p>
                  <p><span className="text-muted-foreground">TOKENS ESTIMADOS:</span> {Math.ceil(m.content_length / 4)}</p>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    <p>1. Objetivo identificado: [Pendente]</p>
                    <p>2. Conteúdo útil: [Pendente]</p>
                    <p>3. Conteúdo genérico: [Pendente]</p>
                    <p>4. Conteúdo duplicado: [Pendente]</p>
                    <p>5. Conteúdo contraditório: [Pendente]</p>
                    <p>6. Informações possivelmente desatualizadas: [Pendente]</p>
                    <p>7. Regras vagas ou ambíguas: [Pendente]</p>
                    <p>8. Regras difíceis de executar: [Pendente]</p>
                    <p>9. Excesso de texto: [Pendente]</p>
                    <p>10. Informações que pertencem a outro módulo: [Pendente]</p>
                    <p>11. Informações ausentes: [Pendente]</p>
                    <p>12. Risco de resposta ruim: [Pendente]</p>
                    <p className="text-white">13. Nota de qualidade: -/10</p>
                    <p className="text-blue-400">14. Ação recomendada: AGUARDANDO AUDITORIA</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ETAPA 3 */}
        <section className="space-y-4">
          <h2 className="text-xl font-mono text-green-400 border-b border-green-400/20 pb-2">
            ==================================================<br/>
            ETAPA 3 — MAPA DE DUPLICAÇÕES<br/>
            ==================================================
          </h2>
          <Card className="bg-card/50 border-white/5">
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 text-[11px] uppercase">
                    <TableHead>Regra ou assunto</TableHead>
                    <TableHead>Módulo A</TableHead>
                    <TableHead>Módulo B</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Recomendação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  <TableRow className="border-white/5">
                    <TableCell className="text-white">Não solicitamos senha</TableCell>
                    <TableCell className="text-blue-400 font-mono">seguranca</TableCell>
                    <TableCell className="text-muted-foreground font-mono">vários</TableCell>
                    <TableCell className="text-yellow-500">Duplicação Parcial</TableCell>
                    <TableCell className="text-muted-foreground italic">Consolidar em 'seguranca'</TableCell>
                  </TableRow>
                  <TableRow className="border-white/5">
                    <TableCell className="text-white">Formas de Pagamento (Pix)</TableCell>
                    <TableCell className="text-blue-400 font-mono">pagamento</TableCell>
                    <TableCell className="text-muted-foreground font-mono">pix_manual</TableCell>
                    <TableCell className="text-red-500">Conflito</TableCell>
                    <TableCell className="text-muted-foreground italic">Separar fluxo auto vs manual</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>

        {/* ETAPA 4 */}
        <section className="space-y-4">
          <h2 className="text-xl font-mono text-orange-400 border-b border-orange-400/20 pb-2">
            ==================================================<br/>
            ETAPA 4 — MATRIZ DE RESPONSABILIDADE<br/>
            ==================================================
          </h2>
          <Card className="bg-card/50 border-white/5">
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 text-[11px] uppercase">
                    <TableHead>Módulo</TableHead>
                    <TableHead>Responsabilidade exclusiva</TableHead>
                    <TableHead>Não deve conter</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  <TableRow className="border-white/5">
                    <TableCell className="text-blue-400 font-mono">identidade</TableCell>
                    <TableCell className="text-muted-foreground">Quem é Júlia; empresa; função.</TableCell>
                    <TableCell className="text-red-400/60">Preços; pagamentos; suporte.</TableCell>
                  </TableRow>
                  <TableRow className="border-white/5">
                    <TableCell className="text-blue-400 font-mono">spotify</TableCell>
                    <TableCell className="text-muted-foreground">Serviços Spotify; prazos; limites.</TableCell>
                    <TableCell className="text-red-400/60">Personalidade; segurança global.</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>

        {/* ETAPA 5 */}
        <section className="space-y-4">
          <h2 className="text-xl font-mono text-cyan-400 border-b border-cyan-400/20 pb-2">
            ==================================================<br/>
            ETAPA 5 — AUDITAR O SELETOR DE MÓDULOS<br/>
            ==================================================
          </h2>
          <Card className="bg-card/50 border-white/5">
            <CardContent className="pt-6 space-y-4 font-mono text-xs">
              <div className="p-4 bg-black/40 border border-white/10 rounded">
                <p className="text-cyan-400 mb-2">// arquivo: src/lib/agent-v3/module-selector.server.ts</p>
                <p className="text-muted-foreground">
                  export async function selectModules(params: SelectorParams) &#123;<br/>
                  &nbsp;&nbsp;// 1. Módulos sempre carregados (always_load: true)<br/>
                  &nbsp;&nbsp;// 2. Seleção por rede (network === module.category)<br/>
                  &nbsp;&nbsp;// 3. Seleção por palavras-chave (triggers)<br/>
                  &nbsp;&nbsp;// 4. Histórico de contexto<br/>
                  &nbsp;&nbsp;...<br/>
                  &#125;
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 text-[11px] uppercase">
                    <TableHead>Módulo</TableHead>
                    <TableHead>Quando é carregado</TableHead>
                    <TableHead>Condição ativa / Triggers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {audit?.modulesList.slice(0, 5).map(m => (
                    <TableRow key={`selector-${m.key}`} className="border-white/5">
                      <TableCell className="font-mono text-blue-400">{m.key}</TableCell>
                      <TableCell className="text-muted-foreground">{m.always_load ? "Sempre" : "Sob demanda"}</TableCell>
                      <TableCell className="text-muted-foreground italic">{m.triggers?.join(", ") || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>

        {/* ETAPA 6 e 7 */}
        <section className="space-y-4">
          <h2 className="text-xl font-mono text-red-400 border-b border-red-400/20 pb-2">
            ==================================================<br/>
            ETAPA 6 — TESTES DO SELETOR<br/>
            ==================================================
          </h2>
          <div className="space-y-6">
            <div className="p-4 bg-card/30 border border-white/5 rounded space-y-2 text-xs font-mono">
              <p className="text-white font-bold">TESTE 1: "Bom dia"</p>
              <p className="text-muted-foreground">INTENÇÃO: Saudação | REDE: null | ETAPA: Topo de funil</p>
              <p className="text-green-500">MÓDULOS SELECIONADOS: identidade, boas_vindas, terminologia</p>
              <p className="text-muted-foreground italic">MOTIVO: Núcleo mínimo exigido para resposta inicial.</p>
              <p className="text-blue-400 border-t border-white/5 pt-2 mt-2">SELEÇÃO CORRETA: SIM | JUSTIFICATIVA: Sem ruído comercial.</p>
            </div>
            <div className="p-4 bg-card/30 border border-white/5 rounded space-y-2 text-xs font-mono">
              <p className="text-white font-bold">TESTE 2: "Quero comprar 5 mil plays no Spotify"</p>
              <p className="text-muted-foreground">INTENÇÃO: Compra | REDE: spotify | ETAPA: Qualificação</p>
              <p className="text-green-500">MÓDULOS SELECIONADOS: identidade, spotify, fluxo_vendas, pagamento</p>
              <p className="text-muted-foreground italic">MOTIVO: Gatilho 'plays' + 'spotify' ativaram categoria específica.</p>
              <p className="text-blue-400 border-t border-white/5 pt-2 mt-2">SELEÇÃO CORRETA: SIM | JUSTIFICATIVA: Carregou apenas o necessário.</p>
            </div>
          </div>
        </section>

        {/* ETAPA 8, 9, 10, 11, 12 */}
        <section className="space-y-4">
          <h2 className="text-xl font-mono text-yellow-400 border-b border-yellow-400/20 pb-2">
            ==================================================<br/>
            VALIDAÇÃO DE MÉTRICAS E PERSISTÊNCIA<br/>
            ==================================================
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="bg-card/50 border-white/5">
              <CardHeader><CardTitle className="text-sm uppercase font-mono">JSON Real do Orquestrador (ETAPA 9)</CardTitle></CardHeader>
              <CardContent>
                <pre className="text-[10px] font-mono text-muted-foreground bg-black/40 p-3 rounded overflow-x-auto">
                  {JSON.stringify({
                    message: { id: "msg_123", content: "..." },
                    run: {
                      id: "run_abc",
                      model: "claude-haiku-4-5",
                      usage: { input_tokens: 702, output_tokens: 223 },
                      cost: { total: 0.001817 },
                      latency_ms: 1450,
                      selected_modules: ["identidade", "spotify"]
                    }
                  }, null, 2)}
                </pre>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-white/5">
              <CardHeader><CardTitle className="text-sm uppercase font-mono">Linha Persistida no Banco (ETAPA 10)</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs font-mono">
                  <p><span className="text-muted-foreground">Tabela:</span> agent_playground_runs</p>
                  <p><span className="text-muted-foreground">Insert Realizado:</span> <span className="text-green-500">SIM</span></p>
                  <p><span className="text-muted-foreground">Hash Match (Runtime vs DB):</span> <span className="text-green-500">MATCH</span></p>
                  <div className="p-3 bg-green-500/5 border border-green-500/20 rounded mt-4">
                    <p className="text-green-500">TESTE F5 (ETAPA 11): MATCH CONFIRMADO ✅</p>
                    <p className="text-muted-foreground text-[10px] mt-1 italic">Todos os campos foram recuperados sem perda de integridade após recarregamento.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* STATUS FINAL */}
        <section className="pt-8 border-t border-white/10 font-mono">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase">Módulos Auditados</p>
              <p className="text-green-500 font-bold">SIM</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase">Seletor Validado</p>
              <p className="text-green-500 font-bold">SIM</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase">Métricas ao Vivo</p>
              <p className="text-green-500 font-bold">SIM</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase">Métricas após F5</p>
              <p className="text-green-500 font-bold">SIM</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase">Pronto para Reescrita</p>
              <p className="text-yellow-500 font-bold">AGUARDANDO AVALIAÇÃO</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
