import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Save, Check, Clock, Building2, ListOrdered, HelpCircle, Plus, Trash2, Package, RefreshCw, BookOpen, ImageIcon, MessageSquare, Loader2, Monitor, ShieldAlert, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { getAgentConfig, saveAgentConfig, getIntegrations, saveIntegrations } from "@/lib/agent.functions";
import { listKnowledge, addTextExample, addImageExample, deleteKnowledge } from "@/lib/knowledge-base.functions";
import { listPanelGuide, addPanelScreen, updatePanelScreen, deletePanelScreen } from "@/lib/panel-guide.functions";
import { listForbiddenRules, saveForbiddenRules, seedDefaultForbiddenRules } from "@/lib/forbidden-rules.functions";
import { syncSmmServices, listFreeTestServices, upsertFreeTestService, deleteFreeTestService, type ServiceRow } from "@/lib/smm-services.functions";
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
  price_query_instruction:
    "Quando o cliente perguntar preço, quantidade mínima ou máxima de qualquer serviço:\n- Consulte a lista de serviços atualizada que foi passada como contexto\n- Encontre o serviço mais relevante para o que o cliente pediu\n- Responda DIRETAMENTE com o preço — nunca mande o link da tabela de serviços\n- Calcule o valor total para a quantidade pedida\n- Se a quantidade pedida for menor que o mínimo, avise e informe o mínimo com o valor\n\nExemplos de como responder:\nCliente: Quanto custa 1000 plays Spotify? → Júlia: 1000 plays Brasil sai R$15 😊 Quer fechar?\nCliente: Posso comprar 100 plays? → Júlia: O mínimo pra plays é 500, que sai R$7,50. Quer começar com esse pacote?\nCliente: Quanto fica 5000 seguidores Instagram HQ? → Júlia: 5000 seguidores HQ Brasil fica R$150. Posso fechar pra você?\n\nNUNCA mande o link mindsmmpanel.com/services quando o cliente perguntar preço. Você tem os valores — responda diretamente.",
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

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Instrução base <span className="text-muted-foreground/60">({cfg.base_instruction.length}/20000)</span>
            </label>
            <textarea
              value={cfg.base_instruction}
              onChange={(e) => setCfg({ ...cfg, base_instruction: e.target.value })}
              rows={16}
              maxLength={20000}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary font-mono"
            />
          </div>

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

          <div className="border-t border-border pt-6">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Consulta de Preços em Tempo Real</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Card separado da instrução base. Quando o toggle estiver ativo, sempre que o cliente perguntar preço ou quantidade, o sistema busca a lista de serviços na API antes de responder e injeta a instrução abaixo no Claude.
            </p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-3">
                <div>
                  <p className="text-sm font-medium">Consultar preços automaticamente</p>
                  <p className="text-xs text-muted-foreground">Busca em https://mindsmmpanel.com/smmpanel/api/v2?action=services&key={"{API_KEY}"} antes de responder.</p>
                </div>
                <Toggle on={cfg.services_realtime} onChange={(v) => setCfg({ ...cfg, services_realtime: v })} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Instrução de preço para o Claude <span className="text-muted-foreground/60">({(cfg.price_query_instruction ?? "").length}/20000)</span>
                </label>
                <textarea
                  value={cfg.price_query_instruction ?? ""}
                  onChange={(e) => setCfg({ ...cfg, price_query_instruction: e.target.value })}
                  rows={14}
                  maxLength={20000}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        <KnowledgeBaseSection />
        <ForbiddenRulesSection />
        <SmmServicesSection />
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

function SmmServicesSection() {
  const qc = useQueryClient();
  const syncFn = useServerFn(syncSmmServices);
  const fetchInt = useServerFn(getIntegrations);
  const listFts = useServerFn(listFreeTestServices);
  const upsertFts = useServerFn(upsertFreeTestService);
  const delFts = useServerFn(deleteFreeTestService);

  const intQ = useQuery({ queryKey: ["integrations"], queryFn: () => fetchInt() });
  const ftsQ = useQuery({ queryKey: ["free_test_services"], queryFn: () => listFts() });

  const [services, setServices] = useState<ServiceRow[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");

  type SyncResult = { ok: boolean; count: number; error: string | null; services: ServiceRow[] };
  const syncMut = useMutation<SyncResult, Error, void>({
    mutationFn: () => syncFn() as Promise<SyncResult>,
    onSuccess: (res) => {
      setServices(res.services ?? []);
      qc.invalidateQueries({ queryKey: ["integrations"] });
      if (res.ok) toast.success(`${res.count} serviços carregados`);
      else toast.error(res.error ?? "Falha ao sincronizar");
    },
    onError: (e) => toast.error(e.message),
  });

  // Auto-load on first open if API key configured and never synced.
  useEffect(() => {
    if (services.length > 0 || syncMut.isPending) return;
    const d = intQ.data as { smm_api_key?: string | null } | null | undefined;
    if (d?.smm_api_key) {
      syncMut.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intQ.data]);

  const integ = (intQ.data ?? {}) as {
    smm_last_sync_at?: string | null;
    smm_last_sync_count?: number | null;
    smm_last_sync_error?: string | null;
    smm_api_key?: string | null;
  };
  const fts = (ftsQ.data ?? []) as Array<{
    id: string; service_id: string; service_name: string; category: string; quantity: number; enabled: boolean;
  }>;
  const ftsByService = new Map(fts.map((f) => [f.service_id, f]));

  const categories = Array.from(new Set(services.map((s) => s.category).filter(Boolean))).sort();
  const filtered = services.filter((s) => {
    if (category && s.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.category.toLowerCase().includes(q) && !s.service.includes(q)) return false;
    }
    return true;
  });

  const formatSync = () => {
    if (!integ.smm_last_sync_at) return "Nunca sincronizado";
    const d = new Date(integ.smm_last_sync_at);
    const hh = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const same = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    const dateStr = same ? "hoje" : d.toLocaleDateString("pt-BR");
    return `${hh} de ${dateStr}`;
  };

  const toggleFreeTest = (s: ServiceRow, currentEnabled: boolean) => {
    const existing = ftsByService.get(s.service);
    upsertFts({
      data: {
        service_id: s.service,
        service_name: s.name,
        category: s.category,
        quantity: existing?.quantity ?? 100,
        enabled: !currentEnabled,
      },
    })
      .then(() => qc.invalidateQueries({ queryKey: ["free_test_services"] }))
      .catch((e: Error) => toast.error(e.message));
  };

  const setQuantity = (s: ServiceRow, qty: number) => {
    const existing = ftsByService.get(s.service);
    upsertFts({
      data: {
        service_id: s.service,
        service_name: s.name,
        category: s.category,
        quantity: qty,
        enabled: existing?.enabled ?? true,
      },
    })
      .then(() => qc.invalidateQueries({ queryKey: ["free_test_services"] }))
      .catch((e: Error) => toast.error(e.message));
  };

  const status = integ.smm_last_sync_error
    ? { tone: "error" as const, text: `❌ Erro ao carregar serviços — ${integ.smm_last_sync_error}` }
    : integ.smm_last_sync_at
      ? { tone: "ok" as const, text: `✅ ${integ.smm_last_sync_count ?? 0} serviços carregados — ${formatSync()}` }
      : { tone: "idle" as const, text: "Nenhuma sincronização ainda. Clique em Sincronizar agora." };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold">Serviços Carregados</h2>
            <p className="text-xs text-muted-foreground">
              Catálogo do painel SMM em tempo real. Marque os serviços que podem ser usados como teste grátis.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {syncMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Sincronizar agora
        </button>
      </div>

      <div className={`rounded-md border px-3 py-2 text-xs ${
        status.tone === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" :
        status.tone === "error" ? "border-destructive/50 bg-destructive/10 text-destructive" :
        "border-border bg-background/60 text-muted-foreground"
      }`}>
        {status.text}
      </div>

      {services.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_220px]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, plataforma ou ID"
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
            >
              <option value="">Todas as categorias ({categories.length})</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="max-h-[480px] overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr className="text-left">
                  <th className="px-2 py-2 font-medium">ID</th>
                  <th className="px-2 py-2 font-medium">Nome</th>
                  <th className="px-2 py-2 font-medium">Categoria</th>
                  <th className="px-2 py-2 text-right font-medium">R$/1000</th>
                  <th className="px-2 py-2 text-right font-medium">Mín</th>
                  <th className="px-2 py-2 text-right font-medium">Máx</th>
                  <th className="px-2 py-2 text-center font-medium">Teste grátis</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 500).map((s) => {
                  const existing = ftsByService.get(s.service);
                  const enabled = existing?.enabled ?? false;
                  return (
                    <tr key={s.service} className="border-t border-border hover:bg-background/60">
                      <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">{s.service}</td>
                      <td className="px-2 py-1.5">{s.name}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{s.category}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{s.rate}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{s.min}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{s.max}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <Toggle on={enabled} onChange={() => toggleFreeTest(s, enabled)} />
                          <input
                            type="number"
                            min={1}
                            value={existing?.quantity ?? 100}
                            onChange={(e) => setQuantity(s, Math.max(1, Number(e.target.value) || 1))}
                            disabled={!enabled}
                            className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right text-xs outline-none focus:border-primary disabled:opacity-50"
                          />
                          {existing && (
                            <button
                              type="button"
                              onClick={() => delFts({ data: { service_id: s.service } })
                                .then(() => qc.invalidateQueries({ queryKey: ["free_test_services"] }))
                                .catch((e: Error) => toast.error(e.message))}
                              className="rounded-md p-1 text-muted-foreground hover:text-destructive"
                              aria-label="Remover"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="p-4 text-center text-xs text-muted-foreground">Nenhum serviço encontrado.</p>
            )}
            {filtered.length > 500 && (
              <p className="p-2 text-center text-[10px] text-muted-foreground">Mostrando os primeiros 500 — refine o filtro.</p>
            )}
          </div>

          {fts.filter((f) => f.enabled).length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {fts.filter((f) => f.enabled).length} serviço(s) ativos para teste grátis. O agente os oferece automaticamente conforme a plataforma do cliente.
            </p>
          )}
        </>
      )}

      {!integ.smm_api_key && (
        <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          Configure a API Key do painel SMM em <strong>Configurações</strong> para listar os serviços.
        </p>
      )}
    </div>
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

type ForbiddenRule = { id?: string; rule: string; deflection: string; enabled: boolean };

function ForbiddenRulesSection() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listForbiddenRules);
  const saveList = useServerFn(saveForbiddenRules);
  const seedFn = useServerFn(seedDefaultForbiddenRules);

  const listQ = useQuery({ queryKey: ["forbidden_rules"], queryFn: () => fetchList() });
  const [rules, setRules] = useState<ForbiddenRule[]>([]);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!listQ.data) return;
    const rows = listQ.data as Array<{ id: string; rule: string; deflection: string | null; enabled: boolean }>;
    if (rows.length === 0 && !seeded) {
      setSeeded(true);
      seedFn().then(() => qc.invalidateQueries({ queryKey: ["forbidden_rules"] })).catch(() => {});
      return;
    }
    setRules(rows.map((r) => ({ id: r.id, rule: r.rule, deflection: r.deflection ?? "", enabled: r.enabled })));
  }, [listQ.data, seeded, seedFn, qc]);

  const saveMut = useMutation({
    mutationFn: () => saveList({ data: { rules: rules.map((r) => ({ rule: r.rule, deflection: r.deflection || null, enabled: r.enabled })) } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forbidden_rules"] });
      toast.success("Regras proibidas salvas");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const update = (i: number, patch: Partial<ForbiddenRule>) => {
    const next = [...rules];
    next[i] = { ...next[i], ...patch };
    setRules(next);
  };

  return (
    <div
      className="rounded-xl border-2 border-destructive/60 p-6 space-y-4"
      style={{ background: "linear-gradient(180deg, rgba(239,68,68,0.08), rgba(239,68,68,0.02))" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          <div>
            <h2 className="font-semibold text-destructive">Regras Proibidas</h2>
            <p className="text-xs text-muted-foreground">
              O agente NUNCA pode quebrar essas regras. Se o cliente insistir, ele desvia com naturalidade.
            </p>
          </div>
        </div>
        <div className="flex flex-none gap-2">
          <button
            type="button"
            onClick={() => setRules([...rules, { rule: "", deflection: "", enabled: true }])}
            className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-background px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar regra
          </button>
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="inline-flex items-center gap-1 rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" /> {saveMut.isPending ? "Salvando…" : "Salvar regras"}
          </button>
        </div>
      </div>

      {listQ.isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}

      <div className="space-y-2">
        {rules.map((r, i) => (
          <div key={i} className="rounded-lg border border-destructive/30 bg-background/60 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <span className="mt-2 text-base">🚫</span>
              <input
                value={r.rule}
                onChange={(e) => update(i, { rule: e.target.value })}
                placeholder="Descrição da proibição"
                className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium outline-none focus:border-destructive"
              />
              <button
                type="button"
                onClick={() => update(i, { enabled: !r.enabled })}
                className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase ${r.enabled ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-background text-muted-foreground"}`}
              >
                {r.enabled ? "Ativa" : "Desativada"}
              </button>
              <button
                type="button"
                onClick={() => setRules(rules.filter((_, j) => j !== i))}
                className="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Remover"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <textarea
              value={r.deflection}
              onChange={(e) => update(i, { deflection: e.target.value })}
              placeholder="Como desviar (opcional)"
              rows={2}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-destructive"
            />
          </div>
        ))}
        {!listQ.isLoading && rules.length === 0 && (
          <p className="rounded-md border border-dashed border-destructive/40 p-4 text-center text-xs text-muted-foreground">
            Nenhuma regra cadastrada. Clique em "Adicionar regra".
          </p>
        )}
      </div>
    </div>
  );
}
