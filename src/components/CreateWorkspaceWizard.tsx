import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { createWorkspace } from "@/lib/workspaces.functions";
import { updateAgentIdentity } from "@/lib/agent-identity.functions";
import { seedBrandFromMindTemplate } from "@/lib/seed-mind-brand.functions";
import { createCategory } from "@/lib/categories.functions";
import { useWorkspace } from "@/contexts/workspace-context";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type CategoryDraft = { nome: string; icone: string };

const STEPS = [
  { n: 1, label: "Nome" },
  { n: 2, label: "Números" },
  { n: 3, label: "Identidade" },
  { n: 4, label: "Categorias" },
] as const;

export function CreateWorkspaceWizard({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { switchWorkspace, refresh } = useWorkspace();

  const createWs = useServerFn(createWorkspace);
  const updateIdent = useServerFn(updateAgentIdentity);
  const seedMind = useServerFn(seedBrandFromMindTemplate);
  const createCat = useServerFn(createCategory);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Passo 1
  const [nome, setNome] = useState("");
  const [icone, setIcone] = useState("📱");

  // Passo 3
  const [useMindTemplate, setUseMindTemplate] = useState(false);
  const [persona, setPersona] = useState("");
  const [terminologia, setTerminologia] = useState("");
  const [exemploDisparo, setExemploDisparo] = useState("");

  // Passo 4
  const [categorias, setCategorias] = useState<CategoryDraft[]>([
    { nome: "Leads", icone: "🎯" },
  ]);

  const resetAll = () => {
    setStep(1);
    setNome("");
    setIcone("📱");
    setUseMindTemplate(false);
    setPersona("");
    setTerminologia("");
    setExemploDisparo("");
    setCategorias([{ nome: "Leads", icone: "🎯" }]);
    setSubmitting(false);
  };

  const handleClose = (o: boolean) => {
    if (submitting) return;
    onOpenChange(o);
    if (!o) resetAll();
  };

  const canNext =
    (step === 1 && nome.trim().length > 0) ||
    step === 2 ||
    step === 3 ||
    step === 4;

  const handleFinish = async () => {
    if (!nome.trim()) {
      setStep(1);
      toast.error("Dê um nome ao workspace");
      return;
    }
    setSubmitting(true);
    try {
      // 1) cria workspace
      const ws = await createWs({ data: { nome: nome.trim(), icone: icone.trim() || "📱" } });
      if (!ws?.id) throw new Error("Falha ao criar workspace");

      // 2) troca contexto pro workspace novo — próximas fns já vão com header correto
      switchWorkspace(ws.id);
      // pequena espera pra localStorage propagar antes das próximas RPCs
      await new Promise((r) => setTimeout(r, 50));

      // 3) identidade
      if (useMindTemplate) {
        try {
          await seedMind();
        } catch (e) {
          console.error("seed mind template falhou", e);
          toast.error("Falha ao aplicar template Mind — segue com os campos vazios");
        }
      } else if (persona.trim() || terminologia.trim() || exemploDisparo.trim()) {
        await updateIdent({
          data: {
            persona: persona.trim() || null,
            terminologia_redes: terminologia.trim() || null,
            exemplo_disparo: exemploDisparo.trim() || null,
          },
        });
      }

      // 4) categorias
      const cats = categorias.map((c) => ({ nome: c.nome.trim(), icone: c.icone.trim() || "🏷️" })).filter((c) => c.nome);
      for (const c of cats) {
        try {
          await createCat({ data: { nome: c.nome, icone: c.icone } });
        } catch (e) {
          console.error("createCategory falhou", c.nome, e);
        }
      }

      toast.success(`Workspace "${ws.nome}" criado!`);
      refresh();
      await qc.invalidateQueries({ refetchType: "all" });
      onOpenChange(false);
      resetAll();
      // navega pra tela Números do novo workspace
      navigate({ to: "/numeros" });
    } catch (e) {
      const msg = (e as Error)?.message ?? "Erro desconhecido";
      toast.error(`Não foi possível criar o workspace: ${msg}`);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Criar novo workspace</DialogTitle>
          <DialogDescription>
            Cada workspace tem números, conversas, contatos e identidade do agente isolados.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 border-y border-border py-3 text-xs">
          {STEPS.map((s, idx) => (
            <div key={s.n} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
                  step === s.n
                    ? "bg-primary text-primary-foreground"
                    : step > s.n
                      ? "bg-emerald-500 text-white"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {s.n}
              </div>
              <span className={cn(step === s.n ? "font-medium" : "text-muted-foreground")}>{s.label}</span>
              {idx < STEPS.length - 1 && <span className="mx-1 text-muted-foreground">—</span>}
            </div>
          ))}
        </div>

        <div className="min-h-[280px] space-y-4 py-2">
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ws-nome">Nome do workspace</Label>
                <Input
                  id="ws-nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Smoke Music, Loja X, Consultório Y…"
                  maxLength={60}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Aparece no seletor de workspaces no topo da barra lateral.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ws-icone">Ícone (emoji)</Label>
                <Input
                  id="ws-icone"
                  value={icone}
                  onChange={(e) => setIcone(e.target.value)}
                  maxLength={4}
                  className="w-24"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm">
              <p className="font-medium">Conectar número(s) do WhatsApp</p>
              <p className="text-muted-foreground">
                A conexão via QR Code acontece na tela <strong>Números</strong>. Depois de finalizar o wizard, você será
                levado direto pra lá, já dentro do workspace novo, e pode conectar quantos números quiser.
              </p>
              <p className="text-xs text-muted-foreground">
                Pode pular por agora e conectar quando quiser — o workspace fica isolado independentemente.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Usar template Mind como ponto de partida</p>
                  <p className="text-xs text-muted-foreground">
                    Copia persona, terminologia e exemplo de disparo da Júlia (Mind). Você pode editar depois na aba
                    Agente. Se preferir começar do zero, deixe desligado e preencha abaixo.
                  </p>
                </div>
                <Switch checked={useMindTemplate} onCheckedChange={setUseMindTemplate} />
              </div>

              {!useMindTemplate && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ws-persona">Persona (opcional)</Label>
                    <Textarea
                      id="ws-persona"
                      value={persona}
                      onChange={(e) => setPersona(e.target.value)}
                      placeholder="Ex: Você é a Ana, curadora da playlist de deep house da Smoke Music…"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ws-term">Terminologia de redes (opcional)</Label>
                    <Textarea
                      id="ws-term"
                      value={terminologia}
                      onChange={(e) => setTerminologia(e.target.value)}
                      placeholder="Ex: chamamos ouvintes de 'ouvintes mensais', playlist de 'seleção'…"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ws-disparo">Exemplo de disparo (opcional)</Label>
                    <Textarea
                      id="ws-disparo"
                      value={exemploDisparo}
                      onChange={(e) => setExemploDisparo(e.target.value)}
                      placeholder="Cole aqui um exemplo real de abertura + resposta de interesse do seu negócio."
                      rows={4}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tudo opcional. Você pode deixar em branco agora e configurar depois em <strong>Agente</strong>.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Categorias ajudam a organizar contatos (ex: Leads, Clientes, Meta Ads). Crie ao menos uma — pode ajustar
                depois.
              </p>
              <div className="space-y-2">
                {categorias.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={c.icone}
                      onChange={(e) => {
                        const next = [...categorias];
                        next[i] = { ...next[i], icone: e.target.value };
                        setCategorias(next);
                      }}
                      maxLength={4}
                      className="w-20"
                      placeholder="🏷️"
                    />
                    <Input
                      value={c.nome}
                      onChange={(e) => {
                        const next = [...categorias];
                        next[i] = { ...next[i], nome: e.target.value };
                        setCategorias(next);
                      }}
                      placeholder="Nome da categoria"
                      maxLength={40}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setCategorias(categorias.filter((_, idx) => idx !== i))}
                      disabled={categorias.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCategorias([...categorias, { nome: "", icone: "🏷️" }])}
                >
                  <Plus className="mr-1 h-4 w-4" /> Adicionar categoria
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || submitting}
          >
            Voltar
          </Button>
          {step < 4 ? (
            <Button
              type="button"
              onClick={() => setStep((s) => Math.min(4, s + 1))}
              disabled={!canNext || submitting}
            >
              Avançar
            </Button>
          ) : (
            <Button type="button" onClick={handleFinish} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar workspace
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}