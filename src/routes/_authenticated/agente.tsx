import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Save, Check, Clock, Building2, ListOrdered, HelpCircle, Plus, Trash2, Package, RefreshCw, BookOpen, ImageIcon, MessageSquare, Loader2, Monitor } from "lucide-react";
import { toast } from "sonner";
import { getAgentConfig, saveAgentConfig, getIntegrations, saveIntegrations } from "@/lib/agent.functions";
import { listKnowledge, addTextExample, addImageExample, deleteKnowledge } from "@/lib/knowledge-base.functions";
import { listPanelGuide, addPanelScreen, updatePanelScreen, deletePanelScreen } from "@/lib/panel-guide.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/agente")({
  ssr: false,
  head: () => ({ meta: [{ title: "Agente IA · ZapAgent" }] }),
  component: AgentePage,
});

type CompanyInfo = {
  name: string; type: string; services: string; platforms: string;
  catalog_link: string; panel_link: string; payments: string;
};
type Faq = { q: string; a: string };

const defaultCompany: CompanyInfo = {
  name: "Mind",
  type: "Plataforma SMM automatizada, 100% online",
  services: "Seguidores, curtidas, visualizações, plays, comentários, avaliações, ouvintes, inscritos, likes",
  platforms: "YouTube, Instagram, TikTok, Spotify, Kwai",
  catalog_link: "https://mindsmmpanel.com/smmpanel/services",
  panel_link: "https://mindsmmpanel.com",
  payments: "PIX (crédito automático) e Criptomoeda (Heleket)",
};

const defaultConfig = {
  agent_name: "Júlia",
  tone: "Amigável e informal",
  base_instruction:
    "Você é a Júlia, atendente da Mind, plataforma SMM online. Seja humana, simpática e direta. Mensagens curtas (máx 2 linhas por vez). Use emojis com moderação. Nunca ofereça produto na primeira mensagem. A empresa não tem sede física, atende apenas online. Nunca revele quem é o dono da empresa. Se perguntarem onde fica a empresa, diga que é 100% online.",
  script_frio: "Oi {nome}! Tudo bem? 😊",
  script_inativo: "Oi {nome}! Sumiu hein 😄 Tudo bem?",
  script_ativo: "Oi {nome}! Tudo certo com o último pedido? 😊",
  panel_link: "https://mindsmmpanel.com",
  main_offer: "Painel SMM com PIX automático",
  audio_enabled: true,
  response_delay_min_sec: 45,
  response_delay_max_sec: 120,
  typing_indicator_enabled: true,
  company_info: defaultCompany,
  how_it_works:
    "1. Criar cadastro no painel\n2. Acessar menu 'Depositar' e adicionar saldo via PIX ou Cripto\n3. Escolher a rede social no menu\n4. Selecionar categoria e serviço\n5. Inserir link ou usuário (perfil deve estar público)\n6. O pedido é processado automaticamente, sem necessidade de senha ou login da conta",
  never_offer_first: true,
  send_panel_on_price: true,
  faqs: [] as Faq[],
  services_realtime: false,
};

type Cfg = typeof defaultConfig;

function AgentePage() {
  const qc = useQueryClient();
  const fetchCfg = useServerFn(getAgentConfig);
  const fetchInt = useServerFn(getIntegrations);
  const saveCfg = useServerFn(saveAgentConfig);
  const saveInt = useServerFn(saveIntegrations);

  const cfgQ = useQuery({ queryKey: ["agent_config"], queryFn: () => fetchCfg() });
  const intQ = useQuery({ queryKey: ["integrations"], queryFn: () => fetchInt() });

  const [cfg, setCfg] = useState<Cfg>(defaultConfig);
  const [intFields, setIntFields] = useState<IntFields | null>(null);

  useEffect(() => {
    if (intQ.data) {
      const d = intQ.data as Partial<IntFields>;
      setIntFields({ ...blankInt, ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v ?? ""])) as IntFields });
    }
  }, [intQ.data]);

  useEffect(() => {
    if (cfgQ.data) {
      const d = cfgQ.data as unknown as Partial<Cfg> & { company_info?: unknown; faqs?: unknown };
      const ci = (d.company_info && typeof d.company_info === "object")
        ? { ...defaultCompany, ...(d.company_info as Partial<CompanyInfo>) }
        : defaultCompany;
      const fq = Array.isArray(d.faqs) ? (d.faqs as Faq[]) : [];
      setCfg({
        ...defaultConfig,
        ...d,
        panel_link: d.panel_link ?? "",
        company_info: ci,
        faqs: fq,
      });
    }
  }, [cfgQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      await saveCfg({ data: cfg });
      if (intFields) await saveInt({ data: intFields });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_config"] });
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e) => {
      toast.error(`Falha ao salvar: ${(e as Error).message}`);
    },
  });

  const reloadMut = useMutation({
    mutationFn: async () => {
      await saveCfg({ data: cfg });
      if (intFields) await saveInt({ data: intFields });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_config"] });
      qc.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Agente atualizado! As próximas conversas usarão as novas configurações.");
    },
    onError: (e) => {
      toast.error(`Falha ao salvar: ${(e as Error).message}`);
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Cérebro do agente</p>
          <h1 className="text-3xl font-bold tracking-tight">Agente IA</h1>
        </div>
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-60"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
        >
          {saveMut.isSuccess && !saveMut.isPending ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saveMut.isPending ? "Salvando…" : saveMut.isSuccess ? "Salvo!" : "Salvar configurações"}
        </button>
        <button
          onClick={() => reloadMut.mutate()}
          disabled={reloadMut.isPending}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-accent disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${reloadMut.isPending ? "animate-spin" : ""}`} />
          {reloadMut.isPending ? "Recarregando…" : "Salvar e Recarregar Agente"}
        </button>
      </header>

      <div className="space-y-6">
        <div className="space-y-6 rounded-xl border border-border p-6" style={{ background: "var(--gradient-card)" }}>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Personalidade</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome do agente" value={cfg.agent_name} onChange={(v) => setCfg({ ...cfg, agent_name: v })} />
            <Field label="Tom de voz" value={cfg.tone} onChange={(v) => setCfg({ ...cfg, tone: v })} />
          </div>

          <Field label="Instrução base" multiline value={cfg.base_instruction} onChange={(v) => setCfg({ ...cfg, base_instruction: v })} />

          <div className="border-t border-border pt-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Sobre a empresa</h2>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Nome" value={cfg.company_info.name} onChange={(v) => setCfg({ ...cfg, company_info: { ...cfg.company_info, name: v } })} />
              <Field label="Tipo" value={cfg.company_info.type} onChange={(v) => setCfg({ ...cfg, company_info: { ...cfg.company_info, type: v } })} />
              <Field label="Plataformas" value={cfg.company_info.platforms} onChange={(v) => setCfg({ ...cfg, company_info: { ...cfg.company_info, platforms: v } })} />
              <Field label="Pagamentos" value={cfg.company_info.payments} onChange={(v) => setCfg({ ...cfg, company_info: { ...cfg.company_info, payments: v } })} />
              <Field label="Link do catálogo" value={cfg.company_info.catalog_link} onChange={(v) => setCfg({ ...cfg, company_info: { ...cfg.company_info, catalog_link: v } })} />
              <Field label="Link do painel" value={cfg.company_info.panel_link} onChange={(v) => setCfg({ ...cfg, company_info: { ...cfg.company_info, panel_link: v } })} />
            </div>
            <div className="mt-4">
              <Field label="Serviços oferecidos" multiline value={cfg.company_info.services} onChange={(v) => setCfg({ ...cfg, company_info: { ...cfg.company_info, services: v } })} />
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <div className="flex items-center gap-2">
              <ListOrdered className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Como funciona o painel</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">O agente explica esses passos ao cliente quando perguntarem.</p>
            <div className="mt-3">
              <textarea
                value={cfg.how_it_works}
                onChange={(e) => setCfg({ ...cfg, how_it_works: e.target.value })}
                rows={8}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary font-mono"
              />
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Comportamento</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Antes de responder, o agente espera um tempo aleatório entre o mínimo e o máximo. Opcionalmente envia "digitando…" no WhatsApp durante a espera.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field
                label="Delay mínimo (segundos)"
                type="number"
                value={String(cfg.response_delay_min_sec)}
                onChange={(v) => setCfg({ ...cfg, response_delay_min_sec: Math.max(0, parseInt(v || "0", 10) || 0) })}
              />
              <Field
                label="Delay máximo (segundos)"
                type="number"
                value={String(cfg.response_delay_max_sec)}
                onChange={(v) => setCfg({ ...cfg, response_delay_max_sec: Math.max(0, parseInt(v || "0", 10) || 0) })}
              />
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-background/40 p-3">
              <div>
                <p className="text-sm font-medium">Mostrar "digitando…"</p>
                <p className="text-xs text-muted-foreground">Envia o status de digitando via Uazapi durante o delay.</p>
              </div>
              <Toggle on={cfg.typing_indicator_enabled} onChange={(v) => setCfg({ ...cfg, typing_indicator_enabled: v })} />
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-background/40 p-3">
              <div>
                <p className="text-sm font-medium">Nunca oferecer produto na primeira mensagem</p>
                <p className="text-xs text-muted-foreground">Primeiro entende o que o cliente quer, depois oferece.</p>
              </div>
              <Toggle on={cfg.never_offer_first} onChange={(v) => setCfg({ ...cfg, never_offer_first: v })} />
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-background/40 p-3">
              <div>
                <p className="text-sm font-medium">Enviar link do painel quando perguntar sobre preço</p>
                <p className="text-xs text-muted-foreground">Manda o link do painel para o cliente consultar valores.</p>
              </div>
              <Toggle on={cfg.send_panel_on_price} onChange={(v) => setCfg({ ...cfg, send_panel_on_price: v })} />
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Perguntas frequentes</h2>
              </div>
              <button
                type="button"
                onClick={() => setCfg({ ...cfg, faqs: [...cfg.faqs, { q: "", a: "" }] })}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"
              >
                <Plus className="h-3 w-3" /> Adicionar
              </button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">O agente usa essas respostas como base de conhecimento.</p>
            <div className="mt-4 space-y-3">
              {cfg.faqs.length === 0 && (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  Nenhuma pergunta cadastrada. Clique em "Adicionar" para criar.
                </p>
              )}
              {cfg.faqs.map((f, i) => (
                <div key={i} className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <input
                      value={f.q}
                      onChange={(e) => {
                        const next = [...cfg.faqs];
                        next[i] = { ...next[i], q: e.target.value };
                        setCfg({ ...cfg, faqs: next });
                      }}
                      placeholder="Pergunta"
                      className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setCfg({ ...cfg, faqs: cfg.faqs.filter((_, j) => j !== i) })}
                      className="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={f.a}
                    onChange={(e) => {
                      const next = [...cfg.faqs];
                      next[i] = { ...next[i], a: e.target.value };
                      setCfg({ ...cfg, faqs: next });
                    }}
                    placeholder="Resposta"
                    rows={3}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Catálogo de Serviços</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Quando ativo, antes de responder perguntas sobre preço o agente busca a lista atualizada de serviços no painel SMM.
            </p>
            <div className="mt-4 space-y-3">
              <Field
                label="API Key do painel SMM"
                value={intFields?.smm_api_key ?? ""}
                onChange={(v) => setIntFields({ ...(intFields ?? blankInt), smm_api_key: v })}
              />
              <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-3">
                <div>
                  <p className="text-sm font-medium">Consultar preços em tempo real</p>
                  <p className="text-xs text-muted-foreground">Busca os serviços na API antes de responder perguntas sobre preço.</p>
                </div>
                <Toggle on={cfg.services_realtime} onChange={(v) => setCfg({ ...cfg, services_realtime: v })} />
              </div>
            </div>
          </div>
        </div>

        <KnowledgeBaseSection />
      </div>
    </div>
  );
}

type KbRow = {
  id: string;
  kind: "image" | "text";
  context: string | null;
  content: string;
  image_url: string | null;
  created_at: string;
};

function KnowledgeBaseSection() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listKnowledge);
  const addText = useServerFn(addTextExample);
  const addImg = useServerFn(addImageExample);
  const del = useServerFn(deleteKnowledge);

  const listQ = useQuery({ queryKey: ["knowledge_base"], queryFn: () => fetchList() });
  const rows = (listQ.data ?? []) as KbRow[];

  const [tab, setTab] = useState<"image" | "text" | "panel">("image");
  const [textCtx, setTextCtx] = useState("");
  const [textBody, setTextBody] = useState("");
  const [imgCtx, setImgCtx] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["knowledge_base"] });

  const addTextMut = useMutation({
    mutationFn: () => addText({ data: { context: textCtx.trim() || null, content: textBody.trim() } }),
    onSuccess: () => {
      setTextCtx("");
      setTextBody("");
      invalidate();
      toast.success("Exemplo adicionado");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: invalidate,
  });

  const onPickImage = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      if (rows.length >= 50) throw new Error("Limite de 50 exemplos atingido.");
      const { data: u, error: uerr } = await supabase.auth.getUser();
      if (uerr || !u.user) throw new Error("Sessão expirada");
      const ext = file.name.split(".").pop() || "png";
      const path = `${u.user.id}/knowledge/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("funnel-media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("funnel-media")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (sErr || !signed) throw sErr ?? new Error("Falha ao gerar URL");
      await addImg({ data: { context: imgCtx.trim() || null, image_url: signed.signedUrl } });
      setImgCtx("");
      invalidate();
      toast.success("Imagem analisada e exemplo salvo");
    } catch (e) {
      setUploadError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border p-6 space-y-5" style={{ background: "var(--gradient-card)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Base de Conhecimento</h2>
        </div>
        <span className="text-xs text-muted-foreground">{rows.length}/50 exemplos</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Adicione exemplos reais de atendimento. O agente aprende o estilo, tom e abordagem desses exemplos e replica nas respostas.
      </p>

      <div className="inline-flex rounded-lg border border-border bg-background p-1 text-xs">
        <button
          type="button"
          onClick={() => setTab("image")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${tab === "image" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <ImageIcon className="h-3.5 w-3.5" /> Imagens
        </button>
        <button
          type="button"
          onClick={() => setTab("text")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${tab === "text" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <MessageSquare className="h-3.5 w-3.5" /> Texto
        </button>
        <button
          type="button"
          onClick={() => setTab("panel")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${tab === "panel" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Monitor className="h-3.5 w-3.5" /> Guia do Painel
        </button>
      </div>

      {tab === "panel" ? (
        <PanelGuideSection />
      ) : tab === "image" ? (
        <div className="space-y-3">
          <Field
            label="Contexto (o que esse exemplo ensina)"
            value={imgCtx}
            onChange={setImgCtx}
          />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-background px-4 py-2.5 text-sm hover:bg-muted">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {uploading ? "Analisando imagem…" : "Adicionar exemplo (JPG/PNG)"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickImage(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
          {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Contexto" value={textCtx} onChange={setTextCtx} />
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Conversa (formato: Cliente: ... / Júlia: ...)
            </span>
            <textarea
              value={textBody}
              onChange={(e) => setTextBody(e.target.value)}
              rows={6}
              placeholder={"Cliente: Tudo BR né?\nJúlia: Sim, trabalhamos com serviço 100% BR"}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-mono outline-none focus:border-primary"
            />
          </label>
          <button
            type="button"
            onClick={() => addTextMut.mutate()}
            disabled={addTextMut.isPending || !textBody.trim()}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground transition disabled:opacity-60"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Plus className="h-4 w-4" /> {addTextMut.isPending ? "Salvando…" : "Adicionar exemplo"}
          </button>
        </div>
      )}

      {tab !== "panel" && (
      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="text-sm font-semibold">Exemplos cadastrados</h3>
        {listQ.isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {!listQ.isLoading && rows.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Nenhum exemplo cadastrado ainda.
          </p>
        )}
        <div className="space-y-2">
          {rows.filter((r) => r.kind === tab).map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-background/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  {r.context && <p className="text-xs font-semibold">{r.context}</p>}
                  {r.kind === "image" && r.image_url && (
                    <img src={r.image_url} alt="" className="max-h-40 rounded border border-border" />
                  )}
                  <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground font-mono">{r.content}</pre>
                </div>
                <button
                  type="button"
                  onClick={() => delMut.mutate(r.id)}
                  className="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

type PanelRow = {
  id: string;
  name: string;
  description: string | null;
  image_url: string;
  extracted_content: string | null;
  created_at: string;
};

function PanelGuideSection() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listPanelGuide);
  const addScreen = useServerFn(addPanelScreen);
  const updateScreen = useServerFn(updatePanelScreen);
  const delScreen = useServerFn(deletePanelScreen);

  const listQ = useQuery({ queryKey: ["panel_guide"], queryFn: () => fetchList() });
  const rows = (listQ.data ?? []) as PanelRow[];

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["panel_guide"] });

  const delMut = useMutation({
    mutationFn: (id: string) => delScreen({ data: { id } }),
    onSuccess: invalidate,
  });

  const onPickImage = async (file: File) => {
    setErr(null);
    if (!name.trim()) {
      setErr("Informe o nome da tela antes de enviar a imagem.");
      return;
    }
    setUploading(true);
    try {
      const { data: u, error: uerr } = await supabase.auth.getUser();
      if (uerr || !u.user) throw new Error("Sessão expirada");
      const ext = file.name.split(".").pop() || "png";
      const path = `${u.user.id}/panel-guide/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("funnel-media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("funnel-media")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (sErr || !signed) throw sErr ?? new Error("Falha ao gerar URL");
      await addScreen({
        data: {
          name: name.trim(),
          description: description.trim() || null,
          image_url: signed.signedUrl,
        },
      });
      setName("");
      setDescription("");
      invalidate();
      toast.success("Tela analisada e adicionada ao guia");
    } catch (e) {
      setErr((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-background/40 p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Envie um print de cada tela importante do painel. A IA descreve o que aparece (botões, campos, fluxo) e usa esse conhecimento para guiar o cliente passo a passo.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="Nome da tela"
            value={name}
            onChange={setName}
          />
          <Field
            label="Descrição (opcional)"
            value={description}
            onChange={setDescription}
          />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-background px-4 py-2.5 text-sm hover:bg-muted">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {uploading ? "Analisando tela…" : "Adicionar tela (JPG/PNG)"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickImage(f);
              e.currentTarget.value = "";
            }}
          />
        </label>
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="text-sm font-semibold">Telas cadastradas</h3>
        {listQ.isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {!listQ.isLoading && rows.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Nenhuma tela cadastrada ainda.
          </p>
        )}
        <div className="space-y-3">
          {rows.map((r) => (
            <PanelScreenItem
              key={r.id}
              row={r}
              onDelete={() => delMut.mutate(r.id)}
              onSave={async (next) => {
                await updateScreen({ data: { id: r.id, name: next.name, description: next.description } });
                invalidate();
                toast.success("Tela atualizada");
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelScreenItem({
  row,
  onDelete,
  onSave,
}: {
  row: PanelRow;
  onDelete: () => void;
  onSave: (next: { name: string; description: string | null }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const [description, setDescription] = useState(row.description ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
      <div className="flex items-start gap-3">
        <img src={row.image_url} alt={row.name} className="h-24 w-24 flex-none rounded border border-border object-cover" />
        <div className="min-w-0 flex-1 space-y-1.5">
          {editing ? (
            <div className="space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-primary"
                placeholder="Nome da tela"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                placeholder="Descrição"
              />
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold">{row.name}</p>
              {row.description && <p className="text-xs text-muted-foreground">{row.description}</p>}
            </>
          )}
        </div>
        <div className="flex flex-none flex-col gap-1">
          {editing ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onSave({ name: name.trim(), description: description.trim() || null });
                    setEditing(false);
                  } finally {
                    setSaving(false);
                  }
                }}
                className="rounded-md border border-border bg-background p-1.5 text-primary hover:bg-muted disabled:opacity-60"
                aria-label="Salvar"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setName(row.name);
                  setDescription(row.description ?? "");
                }}
                className="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:bg-muted"
                aria-label="Cancelar"
              >
                <span className="text-xs">✕</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:bg-muted"
                aria-label="Editar"
              >
                <span className="text-xs">✎</span>
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Remover"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      {row.extracted_content && (
        <details className="rounded-md border border-border bg-background/60 p-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Conteúdo extraído pela IA</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{row.extracted_content}</pre>
        </details>
      )}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`flex h-7 w-12 items-center rounded-full transition ${on ? "bg-primary" : "bg-muted"}`}
    >
      <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

type IntFields = {
  uazapi_url: string; uazapi_token: string; uazapi_admin_token: string;
  anthropic_api_key: string; elevenlabs_api_key: string; elevenlabs_voice_id: string;
  openai_api_key: string;
  smm_api_key: string; smm_panel_url: string;
};

const blankInt: IntFields = {
  uazapi_url: "", uazapi_token: "", uazapi_admin_token: "",
  anthropic_api_key: "", elevenlabs_api_key: "", elevenlabs_voice_id: "",
  openai_api_key: "",
  smm_api_key: "", smm_panel_url: "",
};

function Field({
  label, value, onChange, multiline, type,
}: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; type?: string }) {
  const cls = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary";
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={cls} />
      ) : (
        <input type={type ?? "text"} value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
    </label>
  );
}
