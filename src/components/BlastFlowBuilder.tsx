import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getBlastFlow, saveBlastFlow } from "@/lib/blast-flows.functions";
import { Trash2, Save, Play, RotateCcw, Plus } from "lucide-react";

type NodeKind =
  | "message"
  | "audio"
  | "video"
  | "link"
  | "table"
  | "wait_reply"
  | "condition"
  | "delay"
  | "agent"
  | "end";

type NodeData = Record<string, unknown> & {
  kind: NodeKind;
  label: string;
  content?: string;
  days?: number;
  keywords_yes?: string;
  keywords_no?: string;
  end_status?: string;
};

const KINDS: { kind: NodeKind; icon: string; label: string; color: string }[] = [
  { kind: "message", icon: "📨", label: "Mensagem", color: "#3b82f6" },
  { kind: "audio", icon: "🎵", label: "Áudio", color: "#8b5cf6" },
  { kind: "video", icon: "🎥", label: "Vídeo", color: "#ec4899" },
  { kind: "link", icon: "🔗", label: "Link", color: "#06b6d4" },
  { kind: "table", icon: "📋", label: "Tabela", color: "#10b981" },
  { kind: "wait_reply", icon: "⏱️", label: "Aguardar resposta", color: "#f59e0b" },
  { kind: "condition", icon: "🔀", label: "Condição", color: "#eab308" },
  { kind: "delay", icon: "⏳", label: "Delay (dias)", color: "#64748b" },
  { kind: "agent", icon: "🤖", label: "Agente IA", color: "#a855f7" },
  { kind: "end", icon: "🚫", label: "Encerrar", color: "#ef4444" },
];

function meta(kind: NodeKind) {
  return KINDS.find((k) => k.kind === kind) ?? KINDS[0];
}

function defaultTemplate(): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const nodes: Node<NodeData>[] = [
    { id: "n1", type: "flowCard", position: { x: 250, y: 0 }, data: { kind: "message", label: "Abordagem inicial", content: "Oi {nome}! Tudo bem?" } },
    { id: "n2", type: "flowCard", position: { x: 250, y: 130 }, data: { kind: "wait_reply", label: "Aguardar resposta" } },
    { id: "n3", type: "flowCard", position: { x: 250, y: 260 }, data: { kind: "condition", label: "Condição SIM/NÃO", keywords_yes: "sim, quero, bora, top, interesse, manda, pode", keywords_no: "não, nao, sair, para, obrigado" } },
    { id: "n4", type: "flowCard", position: { x: 60, y: 400 }, data: { kind: "audio", label: "Áudio explicativo" } },
    { id: "n5", type: "flowCard", position: { x: 60, y: 530 }, data: { kind: "link", label: "Link do painel", content: "https://mindsmm.com" } },
    { id: "n6", type: "flowCard", position: { x: 60, y: 660 }, data: { kind: "video", label: "Vídeo como funciona" } },
    { id: "n7", type: "flowCard", position: { x: 60, y: 790 }, data: { kind: "table", label: "Tabela de serviços" } },
    { id: "n8", type: "flowCard", position: { x: 60, y: 920 }, data: { kind: "agent", label: "Agente IA assume" } },
    { id: "n9", type: "flowCard", position: { x: 480, y: 400 }, data: { kind: "message", label: "Despedida", content: "Tudo bem, desculpa o incômodo! Se precisar é só chamar 😊" } },
    { id: "n10", type: "flowCard", position: { x: 480, y: 530 }, data: { kind: "end", label: "Encerrar", end_status: "perdido" } },
  ];
  const e = (id: string, s: string, t: string, label?: string): Edge => ({
    id,
    source: s,
    target: t,
    label,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "hsl(var(--primary))" },
  });
  const edges: Edge[] = [
    e("e1", "n1", "n2"),
    e("e2", "n2", "n3"),
    e("e3", "n3", "n4", "SIM"),
    e("e4", "n4", "n5"),
    e("e5", "n5", "n6"),
    e("e6", "n6", "n7"),
    e("e7", "n7", "n8"),
    e("e8", "n3", "n9", "NÃO"),
    e("e9", "n9", "n10"),
  ];
  return { nodes, edges };
}

function FlowCardNode({ data, selected }: { data: NodeData; selected?: boolean }) {
  const m = meta(data.kind);
  return (
    <div
      className="rounded-lg border-2 bg-card px-3 py-2 shadow-sm min-w-[180px]"
      style={{ borderColor: selected ? m.color : "hsl(var(--border))" }}
    >
      <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: m.color }}>
        <span>{m.icon}</span>
        <span>{m.label}</span>
      </div>
      <div className="mt-1 text-sm font-medium truncate max-w-[220px]">{data.label}</div>
      {data.content && (
        <div className="mt-1 text-[11px] text-muted-foreground truncate max-w-[220px]">{data.content}</div>
      )}
    </div>
  );
}

const nodeTypes = { flowCard: FlowCardNode };

export function BlastFlowBuilder({ campaignId }: { campaignId: string }) {
  return (
    <ReactFlowProvider>
      <Inner campaignId={campaignId} />
    </ReactFlowProvider>
  );
}

function Inner({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getBlastFlow);
  const saveFn = useServerFn(saveBlastFlow);
  const { data: flow, isLoading } = useQuery({
    queryKey: ["blast_flow", campaignId],
    queryFn: () => getFn({ data: { campaignId } }),
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selected, setSelected] = useState<Node<NodeData> | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (isLoading || loaded) return;
    if (flow && Array.isArray(flow.nodes) && flow.nodes.length > 0) {
      setNodes(flow.nodes as unknown as Node<NodeData>[]);
      setEdges(flow.edges as unknown as Edge[]);
    } else {
      const t = defaultTemplate();
      setNodes(t.nodes);
      setEdges(t.edges);
    }
    setLoaded(true);
  }, [flow, isLoading, loaded, setNodes, setEdges]);

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) =>
        addEdge({ ...c, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: "hsl(var(--primary))" } }, eds),
      ),
    [setEdges],
  );

  const addNode = useCallback(
    (kind: NodeKind) => {
      const m = meta(kind);
      const id = `n_${Date.now()}`;
      setNodes((ns) => [
        ...ns,
        {
          id,
          type: "flowCard",
          position: { x: 400 + Math.random() * 80, y: 40 + Math.random() * 80 },
          data: { kind, label: m.label },
        },
      ]);
    },
    [setNodes],
  );

  const updateSelected = useCallback(
    (patch: Partial<NodeData>) => {
      if (!selected) return;
      setNodes((ns) => ns.map((n) => (n.id === selected.id ? { ...n, data: { ...n.data, ...patch } } : n)));
      setSelected((s) => (s ? { ...s, data: { ...s.data, ...patch } } : s));
    },
    [selected, setNodes],
  );

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    setNodes((ns) => ns.filter((n) => n.id !== selected.id));
    setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id));
    setSelected(null);
  }, [selected, setNodes, setEdges]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          campaignId,
          nodes: nodes as unknown as Record<string, unknown>[],
          edges: edges as unknown as Record<string, unknown>[],
        },
      }),
    onSuccess: () => {
      toast.success("Fluxo salvo");
      qc.invalidateQueries({ queryKey: ["blast_flow", campaignId] });
    },
    onError: (e: Error) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  const resetTemplate = useCallback(() => {
    if (!confirm("Substituir pelo fluxo padrão? As alterações atuais serão perdidas.")) return;
    const t = defaultTemplate();
    setNodes(t.nodes);
    setEdges(t.edges);
    setSelected(null);
  }, [setNodes, setEdges]);

  const testFlow = useCallback(() => {
    const errors: string[] = [];
    const ids = new Set(nodes.map((n) => n.id));
    edges.forEach((e) => {
      if (!ids.has(e.source) || !ids.has(e.target)) errors.push(`Conexão inválida: ${e.id}`);
    });
    const noStart = nodes.filter((n) => !edges.some((e) => e.target === n.id));
    if (noStart.length !== 1) errors.push(`Deve haver exatamente 1 nó inicial (encontrados: ${noStart.length})`);
    if (errors.length === 0) toast.success("Fluxo válido ✓");
    else toast.error(errors.join(" · "));
  }, [nodes, edges]);

  const memoNodeTypes = useMemo(() => nodeTypes, []);

  return (
    <div className="rounded-xl border border-border overflow-hidden" style={{ background: "var(--gradient-card)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Construtor de fluxo</span>
          <span className="text-xs text-muted-foreground">
            {nodes.length} etapa(s) · {edges.length} conexão(ões)
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={resetTemplate}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Usar fluxo padrão
          </button>
          <button
            onClick={testFlow}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
          >
            <Play className="h-3.5 w-3.5" /> Testar
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Save className="h-3.5 w-3.5" /> {saveMut.isPending ? "Salvando…" : "Salvar fluxo"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-0" style={{ height: 620 }}>
        {/* Palette */}
        <aside className="col-span-12 md:col-span-2 border-r border-border p-2 overflow-y-auto bg-background/50">
          <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Adicionar</p>
          <div className="space-y-1">
            {KINDS.map((k) => (
              <button
                key={k.kind}
                onClick={() => addNode(k.kind)}
                className="w-full inline-flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs hover:bg-muted"
              >
                <span>{k.icon}</span>
                <span className="truncate">{k.label}</span>
                <Plus className="ml-auto h-3 w-3 opacity-50" />
              </button>
            ))}
          </div>
        </aside>

        {/* Canvas */}
        <div className="col-span-12 md:col-span-7 h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelected(n as Node<NodeData>)}
            onPaneClick={() => setSelected(null)}
            nodeTypes={memoNodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        {/* Inspector */}
        <aside className="col-span-12 md:col-span-3 border-l border-border p-3 overflow-y-auto bg-background/50">
          {!selected ? (
            <p className="text-xs text-muted-foreground">Clique em um card para editar.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  {meta(selected.data.kind).icon} {meta(selected.data.kind).label}
                </span>
                <button
                  onClick={deleteSelected}
                  className="rounded-md p-1 text-destructive hover:bg-destructive/10"
                  title="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <label className="block text-xs">
                <span className="text-muted-foreground">Título</span>
                <input
                  value={selected.data.label ?? ""}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none"
                />
              </label>
              {(selected.data.kind === "message" || selected.data.kind === "link") && (
                <label className="block text-xs">
                  <span className="text-muted-foreground">
                    {selected.data.kind === "link" ? "URL" : "Texto (use {nome})"}
                  </span>
                  <textarea
                    value={selected.data.content ?? ""}
                    onChange={(e) => updateSelected({ content: e.target.value })}
                    rows={4}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none"
                  />
                </label>
              )}
              {(selected.data.kind === "audio" || selected.data.kind === "video" || selected.data.kind === "table") && (
                <p className="text-[11px] text-muted-foreground">
                  A mídia é escolhida automaticamente pelo agente a partir das mídias cadastradas em Agente IA.
                </p>
              )}
              {selected.data.kind === "delay" && (
                <label className="block text-xs">
                  <span className="text-muted-foreground">Dias de espera</span>
                  <input
                    type="number"
                    min={0}
                    value={selected.data.days ?? 3}
                    onChange={(e) => updateSelected({ days: Number(e.target.value) })}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none"
                  />
                </label>
              )}
              {selected.data.kind === "condition" && (
                <>
                  <label className="block text-xs">
                    <span className="text-muted-foreground">Palavras-chave SIM (separadas por vírgula)</span>
                    <textarea
                      value={selected.data.keywords_yes ?? ""}
                      onChange={(e) => updateSelected({ keywords_yes: e.target.value })}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none"
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="text-muted-foreground">Palavras-chave NÃO</span>
                    <textarea
                      value={selected.data.keywords_no ?? ""}
                      onChange={(e) => updateSelected({ keywords_no: e.target.value })}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none"
                    />
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Conecte 2 saídas deste card e rotule as arestas com SIM / NÃO.
                  </p>
                </>
              )}
              {selected.data.kind === "end" && (
                <label className="block text-xs">
                  <span className="text-muted-foreground">Status final</span>
                  <select
                    value={selected.data.end_status ?? "perdido"}
                    onChange={(e) => updateSelected({ end_status: e.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none"
                  >
                    <option value="perdido">Perdido</option>
                    <option value="convertido">Convertido</option>
                    <option value="sem_resposta">Sem resposta</option>
                    <option value="descartado">Descartado</option>
                  </select>
                </label>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}