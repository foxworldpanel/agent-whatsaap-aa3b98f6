import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Upload, Search, Plus, Trash2, Flame, Thermometer, Snowflake, Ban,
  CheckCircle2, Download, X, Loader2, LayoutGrid, Table as TableIcon,
  FolderPlus, Instagram, Megaphone, Link2, MessageSquare,
} from "lucide-react";
import { type ContactProfile } from "@/lib/mock-data";
import { listContacts, importContacts, createContact, deleteContact } from "@/lib/contacts.functions";
import {
  listContactGroups, createContactGroup, deleteContactGroup,
  assignContactsToGroup, bulkUpdateContacts, updateContactFields,
} from "@/lib/contacts-crm.functions";
import { extractChatsFromNumber, importExtractedContacts } from "@/lib/extraction.functions";
import { listNumbers } from "@/lib/numbers.functions";
import { listWelcomeFunnels } from "@/lib/welcome-funnels.functions";

export const Route = createFileRoute("/_authenticated/contatos")({
  ssr: false,
  head: () => ({ meta: [{ title: "CRM · Contatos · ZapAgent" }] }),
  component: Contatos,
});

type Temperatura = "quente" | "morno" | "frio" | "cliente" | "bloqueado";
type StatusCRM =
  | "nao_abordado" | "abordado_aguardando" | "em_conversa"
  | "proposta_enviada" | "comprou" | "perdido"
  | "convertido" | "sem_resposta" | "bloqueado";
type Origem = "meta_ads" | "instagram_csv" | "grupo_wpp" | "organico";

const tempMeta: Record<Temperatura, { label: string; cls: string; Icon: typeof Flame; emoji: string }> = {
  frio:      { label: "Frio",      emoji: "❄️", cls: "bg-primary/15 text-primary border-primary/30", Icon: Snowflake },
  morno:     { label: "Morno",     emoji: "🌤️", cls: "bg-warning/15 text-warning border-warning/30", Icon: Thermometer },
  quente:    { label: "Quente",    emoji: "🔥", cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: Flame },
  cliente:   { label: "Cliente",   emoji: "✅", cls: "bg-success/15 text-success border-success/30", Icon: CheckCircle2 },
  bloqueado: { label: "Bloqueado", emoji: "🚫", cls: "bg-muted text-muted-foreground border-border", Icon: Ban },
};

const statusMeta: Record<StatusCRM, { label: string; cls: string }> = {
  nao_abordado:        { label: "Não abordado",        cls: "bg-muted text-muted-foreground" },
  abordado_aguardando: { label: "Aguardando resposta", cls: "bg-primary/15 text-primary" },
  em_conversa:         { label: "Em conversa",         cls: "bg-primary/25 text-primary" },
  proposta_enviada:    { label: "Proposta enviada",    cls: "bg-warning/20 text-warning" },
  comprou:             { label: "Comprou",             cls: "bg-success/20 text-success" },
  perdido:             { label: "Perdido",             cls: "bg-destructive/15 text-destructive" },
  convertido:          { label: "Convertido",          cls: "bg-success/20 text-success" },
  sem_resposta:        { label: "Sem resposta",        cls: "bg-warning/15 text-warning" },
  bloqueado:           { label: "Bloqueado",           cls: "bg-destructive/20 text-destructive" },
};

const origemMeta: Record<Origem, { label: string; emoji: string; Icon: typeof Megaphone }> = {
  meta_ads:      { label: "Meta Ads",         emoji: "📢", Icon: Megaphone },
  instagram_csv: { label: "Instagram (CSV)",  emoji: "📱", Icon: Instagram },
  grupo_wpp:     { label: "Grupo WhatsApp",   emoji: "💬", Icon: MessageSquare },
  organico:      { label: "Orgânico",         emoji: "🔗", Icon: Link2 },
};

function normOrigem(source: string | null | undefined): Origem | null {
  if (!source) return null;
  const s = source.toLowerCase();
  if (s.includes("meta") || s === "ads") return "meta_ads";
  if (s.includes("insta") || s === "csv") return "instagram_csv";
  if (s.includes("grupo") || s.includes("group")) return "grupo_wpp";
  if (s.includes("organ") || s === "inbound") return "organico";
  return null;
}

type Contact = {
  id: string; nome: string; telefone: string;
  instagram: string | null; source: string | null;
  status: string; temperatura: string | null;
  perfil: string; last_interaction_at: string | null;
  photo_url: string | null;
};

const KANBAN_COLS: Temperatura[] = ["frio", "morno", "quente", "cliente"];

function Contatos() {
  const qc = useQueryClient();
  const list = useServerFn(listContacts);
  const imp = useServerFn(importContacts);
  const create = useServerFn(createContact);
  const del = useServerFn(deleteContact);
  const groupsList = useServerFn(listContactGroups);
  const groupCreate = useServerFn(createContactGroup);
  const groupDelete = useServerFn(deleteContactGroup);
  const groupAssign = useServerFn(assignContactsToGroup);
  const bulk = useServerFn(bulkUpdateContacts);
  const updateFields = useServerFn(updateContactFields);
  const extract = useServerFn(extractChatsFromNumber);
  const importExtract = useServerFn(importExtractedContacts);
  const numbersList = useServerFn(listNumbers);
  const funnelsList = useServerFn(listWelcomeFunnels);
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [origemFilter, setOrigemFilter] = useState<Set<Origem>>(new Set());
  const [tempFilter, setTempFilter] = useState<Set<Temperatura>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<StatusCRM>>(new Set());
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"table" | "kanban">("table");
  const [showAdd, setShowAdd] = useState(false);
  const [showExtract, setShowExtract] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => list() as Promise<Contact[]>,
  });

  const { data: groupData = { groups: [], members: [] } } = useQuery({
    queryKey: ["contact-groups"],
    queryFn: () => groupsList(),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["contacts"] });
    qc.invalidateQueries({ queryKey: ["contact-groups"] });
  };

  const importMut = useMutation({
    mutationFn: (rows: { nome: string; telefone: string; perfil: ContactProfile }[]) =>
      imp({ data: { rows } }),
    onSuccess: invalidateAll,
  });
  const createMut = useMutation({
    mutationFn: (input: { nome: string; telefone: string; perfil: ContactProfile }) =>
      create({ data: { ...input, status: "nao_abordado" } }),
    onSuccess: () => { invalidateAll(); setShowAdd(false); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: invalidateAll,
  });
  const bulkMut = useMutation({
    mutationFn: (v: { contact_ids: string[]; temperatura?: Temperatura; status?: StatusCRM }) =>
      bulk({ data: v }),
    onSuccess: () => { invalidateAll(); setSelected(new Set()); },
  });
  const updateMut = useMutation({
    mutationFn: (v: { id: string; temperatura?: Temperatura; status?: StatusCRM; instagram?: string | null }) =>
      updateFields({ data: v }),
    onSuccess: invalidateAll,
  });
  const groupCreateMut = useMutation({
    mutationFn: (name: string) => groupCreate({ data: { name } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contact-groups"] }); setShowNewGroup(false); },
  });
  const groupDeleteMut = useMutation({
    mutationFn: (id: string) => groupDelete({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-groups"] });
      setActiveGroup((g) => (g ? null : g));
    },
  });
  const assignMut = useMutation({
    mutationFn: (v: { group_id: string; contact_ids: string[] }) => groupAssign({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contact-groups"] }); setSelected(new Set()); },
  });

  // Map contact -> group memberships
  const membersByContact = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const row of groupData.members) {
      if (!m.has(row.contact_id)) m.set(row.contact_id, new Set());
      m.get(row.contact_id)!.add(row.group_id);
    }
    return m;
  }, [groupData.members]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (activeGroup && !membersByContact.get(c.id)?.has(activeGroup)) return false;
      if (origemFilter.size > 0) {
        const o = normOrigem(c.source);
        if (!o || !origemFilter.has(o)) return false;
      }
      if (tempFilter.size > 0) {
        const t = (c.temperatura ?? "frio") as Temperatura;
        if (!tempFilter.has(t)) return false;
      }
      if (statusFilter.size > 0 && !statusFilter.has(c.status as StatusCRM)) return false;
      if (s) {
        const hay = `${c.nome} ${c.telefone} ${c.instagram ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [contacts, activeGroup, membersByContact, origemFilter, tempFilter, statusFilter, search]);

  function toggleSet<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  }
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function selectAllVisible() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.id)));
  }

  async function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const rows: { nome: string; telefone: string; perfil: ContactProfile }[] = [];
    for (const line of lines) {
      const [nome, telefone, perfil] = line.split(",").map((x) => x?.trim());
      if (!nome || !telefone) continue;
      if (nome.toLowerCase() === "nome") continue;
      const p = (["ativo", "frio", "inativo"] as const).includes(perfil as ContactProfile)
        ? (perfil as ContactProfile) : "frio";
      rows.push({ nome, telefone, perfil: p });
    }
    if (rows.length) importMut.mutate(rows);
    if (fileRef.current) fileRef.current.value = "";
  }

  function exportCsv() {
    const header = ["Nome", "Telefone", "Instagram", "Origem", "Temperatura", "Status", "Ultima interacao"];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = filtered.map((c) => {
      const o = normOrigem(c.source);
      return [
        c.nome, c.telefone, c.instagram ?? "",
        o ? origemMeta[o].label : (c.source ?? ""),
        (c.temperatura ?? "frio"),
        statusMeta[c.status as StatusCRM]?.label ?? c.status,
        c.last_interaction_at ?? "",
      ].map((v) => escape(String(v))).join(",");
    });
    const csv = [header.map(escape).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `contatos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">CRM</p>
          <h1 className="text-3xl font-bold tracking-tight">Contatos</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            <button onClick={() => setView("table")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${view === "table" ? "bg-muted text-foreground" : "text-muted-foreground"}`}>
              <TableIcon className="h-3.5 w-3.5" /> Tabela
            </button>
            <button onClick={() => setView("kanban")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${view === "kanban" ? "bg-muted text-foreground" : "text-muted-foreground"}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </button>
          </div>
          <button onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition hover:bg-muted">
            <Download className="h-4 w-4" /> Exportar CSV
          </button>
          <button onClick={() => setShowExtract(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition hover:bg-muted">
            <Download className="h-4 w-4" /> Extrair WhatsApp
          </button>
          <button onClick={() => setShowAdd((s) => !s)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition hover:bg-muted">
            <Plus className="h-4 w-4" /> Novo
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsv} />
          <button onClick={() => fileRef.current?.click()} disabled={importMut.isPending}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-60"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}>
            <Upload className="h-4 w-4" />
            {importMut.isPending ? "Importando…" : "Importar CSV"}
          </button>
        </div>
      </header>

      {showAdd && (
        <AddForm onCancel={() => setShowAdd(false)} onSubmit={(v) => createMut.mutate(v)} pending={createMut.isPending} />
      )}

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Sidebar with lists */}
        <aside className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Listas</h3>
            <button onClick={() => setShowNewGroup(true)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Nova lista">
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>
          <button onClick={() => setActiveGroup(null)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${activeGroup === null ? "bg-muted font-medium" : "hover:bg-muted/50"}`}>
            <span>Todos os contatos</span>
            <span className="text-xs text-muted-foreground">{contacts.length}</span>
          </button>
          {groupData.groups.map((g) => {
            const count = groupData.members.filter((m) => m.group_id === g.id).length;
            const active = activeGroup === g.id;
            return (
              <div key={g.id} className={`group flex items-center gap-1 rounded-lg pr-1 ${active ? "bg-muted" : "hover:bg-muted/50"}`}>
                <button onClick={() => setActiveGroup(g.id)} className="flex flex-1 items-center justify-between px-3 py-2 text-sm">
                  <span className={active ? "font-medium" : ""}>{g.name}</span>
                  <span className="text-xs text-muted-foreground">{count}</span>
                </button>
                <button
                  onClick={() => { if (confirm(`Excluir lista "${g.name}"?`)) groupDeleteMut.mutate(g.id); }}
                  className="rounded-md p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-destructive/15 hover:text-destructive"
                  title="Excluir lista">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          {showNewGroup && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const name = String(fd.get("name") ?? "").trim();
                if (name) groupCreateMut.mutate(name);
              }}
              className="flex gap-1 pt-1">
              <input name="name" autoFocus placeholder="Nome da lista"
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary" />
              <button type="submit" className="rounded-md bg-primary px-2 py-1.5 text-xs font-semibold text-primary-foreground">OK</button>
              <button type="button" onClick={() => setShowNewGroup(false)} className="rounded-md border border-border px-2 py-1.5 text-xs">✕</button>
            </form>
          )}
        </aside>

        <div className="min-w-0 space-y-4">
          {/* Search + filter bars */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, telefone ou @instagram…"
                className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2.5 text-sm outline-none transition focus:border-primary" />
            </div>

            <FilterRow label="Origem">
              {(Object.keys(origemMeta) as Origem[]).map((o) => {
                const active = origemFilter.has(o);
                return (
                  <FilterChip key={o} active={active} onClick={() => toggleSet(setOrigemFilter, o)}>
                    <span>{origemMeta[o].emoji}</span> {origemMeta[o].label}
                  </FilterChip>
                );
              })}
            </FilterRow>

            <FilterRow label="Temperatura">
              {(Object.keys(tempMeta) as Temperatura[]).map((t) => {
                const active = tempFilter.has(t);
                return (
                  <FilterChip key={t} active={active} onClick={() => toggleSet(setTempFilter, t)} className={active ? tempMeta[t].cls : undefined}>
                    <span>{tempMeta[t].emoji}</span> {tempMeta[t].label}
                  </FilterChip>
                );
              })}
            </FilterRow>

            <FilterRow label="Status">
              {(["nao_abordado", "abordado_aguardando", "em_conversa", "proposta_enviada", "comprou", "perdido"] as StatusCRM[]).map((s) => {
                const active = statusFilter.has(s);
                return (
                  <FilterChip key={s} active={active} onClick={() => toggleSet(setStatusFilter, s)}>
                    {statusMeta[s].label}
                  </FilterChip>
                );
              })}
            </FilterRow>
          </div>

          {/* Bulk actions bar */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
              <span className="font-medium">{selected.size} selecionado(s)</span>
              <div className="h-4 w-px bg-border" />
              <label className="text-xs text-muted-foreground">Mover para:</label>
              <select
                onChange={(e) => {
                  const gid = e.target.value;
                  if (gid) { assignMut.mutate({ group_id: gid, contact_ids: [...selected] }); e.target.value = ""; }
                }}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs">
                <option value="">Selecionar lista…</option>
                {groupData.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <label className="text-xs text-muted-foreground">Temperatura:</label>
              <select
                onChange={(e) => {
                  const t = e.target.value as Temperatura | "";
                  if (t) { bulkMut.mutate({ contact_ids: [...selected], temperatura: t }); e.target.value = ""; }
                }}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs">
                <option value="">Mudar…</option>
                {(Object.keys(tempMeta) as Temperatura[]).map((t) => (
                  <option key={t} value={t}>{tempMeta[t].emoji} {tempMeta[t].label}</option>
                ))}
              </select>
              <button onClick={exportCsv}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs hover:bg-muted">
                <Download className="h-3.5 w-3.5" /> Exportar
              </button>
              <button
                onClick={() => bulkMut.mutate({ contact_ids: [...selected], temperatura: "bloqueado", status: "bloqueado" })}
                className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/20">
                <Ban className="h-3.5 w-3.5" /> Bloquear
              </button>
              <button onClick={() => setSelected(new Set())}
                className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {view === "table" ? (
            <div className="overflow-hidden rounded-xl border border-border" style={{ background: "var(--gradient-card)" }}>
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input type="checkbox"
                        checked={filtered.length > 0 && selected.size === filtered.length}
                        onChange={selectAllVisible} />
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Nome</th>
                    <th className="px-4 py-3 text-left font-medium">Telefone</th>
                    <th className="px-4 py-3 text-left font-medium">Instagram</th>
                    <th className="px-4 py-3 text-left font-medium">Origem</th>
                    <th className="px-4 py-3 text-left font-medium">Temperatura</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Última interação</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((c) => {
                    const o = normOrigem(c.source);
                    const t = (c.temperatura ?? "frio") as Temperatura;
                    const meta = tempMeta[t] ?? tempMeta.frio;
                    const st = (c.status as StatusCRM) ?? "nao_abordado";
                    const sm = statusMeta[st] ?? statusMeta.nao_abordado;
                    return (
                      <tr key={c.id} className={`transition hover:bg-muted/20 ${selected.has(c.id) ? "bg-primary/5" : ""}`}>
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
                        </td>
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            {c.photo_url ? (
                              <img src={c.photo_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                            ) : (
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                                {(c.nome?.[0] ?? "?").toUpperCase()}
                              </div>
                            )}
                            <span>{c.nome}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">{c.telefone}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {c.instagram
                            ? <span className="inline-flex items-center gap-1"><Instagram className="h-3 w-3" />{c.instagram.replace(/^@?/, "@")}</span>
                            : <InlineIgEdit id={c.id} onSave={(ig) => updateMut.mutate({ id: c.id, instagram: ig })} />}
                        </td>
                        <td className="px-4 py-3">
                          {o ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs">
                              <span>{origemMeta[o].emoji}</span> {origemMeta[o].label}
                            </span>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={t}
                            onChange={(e) => updateMut.mutate({ id: c.id, temperatura: e.target.value as Temperatura })}
                            className={`cursor-pointer rounded-full border px-2 py-0.5 text-xs outline-none ${meta.cls}`}>
                            {(Object.keys(tempMeta) as Temperatura[]).map((k) => (
                              <option key={k} value={k}>{tempMeta[k].emoji} {tempMeta[k].label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={st}
                            onChange={(e) => updateMut.mutate({ id: c.id, status: e.target.value as StatusCRM })}
                            className={`cursor-pointer rounded-full px-2 py-0.5 text-xs outline-none ${sm.cls}`}>
                            {(["nao_abordado", "abordado_aguardando", "em_conversa", "proposta_enviada", "comprou", "perdido"] as StatusCRM[]).map((k) => (
                              <option key={k} value={k}>{statusMeta[k].label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {c.last_interaction_at ? new Date(c.last_interaction_at).toLocaleString("pt-BR") : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => deleteMut.mutate(c.id)}
                            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive"
                            title="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!isLoading && filtered.length === 0 && (
                    <tr><td colSpan={9} className="px-5 py-12 text-center text-muted-foreground">Nenhum contato encontrado</td></tr>
                  )}
                  {isLoading && (
                    <tr><td colSpan={9} className="px-5 py-12 text-center text-muted-foreground">Carregando…</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <KanbanView contacts={filtered} onMove={(id, temp) => updateMut.mutate({ id, temperatura: temp })} />
          )}
        </div>
      </div>

      {showExtract && (
        <ExtractionPanel
          onClose={() => setShowExtract(false)}
          numbersList={numbersList}
          funnelsList={funnelsList}
          extract={extract}
          importExtract={importExtract}
          onImported={invalidateAll}
        />
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}:</span>
      {children}
    </div>
  );
}

function FilterChip({
  active, onClick, children, className,
}: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${
        active
          ? className ?? "border-primary bg-primary/15 text-primary font-medium"
          : "border-border bg-card text-muted-foreground hover:bg-muted"
      }`}>
      {children}
    </button>
  );
}

function InlineIgEdit({ id, onSave }: { id: string; onSave: (ig: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState("");
  if (!editing) return (
    <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground/60 hover:text-primary">+ Instagram</button>
  );
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) onSave(v.trim()); setEditing(false); }} className="flex gap-1">
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="@user"
        className="w-24 rounded border border-border bg-background px-1.5 py-0.5 text-xs outline-none focus:border-primary" />
      <button type="submit" className="text-xs text-primary">OK</button>
    </form>
  );
}

function KanbanView({
  contacts, onMove,
}: { contacts: Contact[]; onMove: (id: string, t: Temperatura) => void }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const cols: Temperatura[] = KANBAN_COLS;
  return (
    <div className="grid gap-3 md:grid-cols-4">
      {cols.map((t) => {
        const meta = tempMeta[t];
        const items = contacts.filter((c) => (c.temperatura ?? "frio") === t);
        return (
          <div key={t}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragId) { onMove(dragId, t); setDragId(null); } }}
            className="flex flex-col rounded-xl border border-border bg-card p-3">
            <div className={`mb-2 inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${meta.cls}`}>
              <span>{meta.emoji}</span> {meta.label} · {items.length}
            </div>
            <div className="space-y-2">
              {items.map((c) => (
                <div key={c.id} draggable
                  onDragStart={() => setDragId(c.id)}
                  onDragEnd={() => setDragId(null)}
                  className="cursor-grab rounded-lg border border-border bg-background p-2.5 text-sm shadow-sm hover:border-primary/40">
                  <div className="flex items-center gap-2">
                    {c.photo_url ? (
                      <img src={c.photo_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                        {(c.nome?.[0] ?? "?").toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.nome}</div>
                      <div className="truncate text-[11px] text-muted-foreground tabular-nums">{c.telefone}</div>
                    </div>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  Arraste um contato aqui
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddForm({
  onCancel, onSubmit, pending,
}: {
  onCancel: () => void;
  onSubmit: (v: { nome: string; telefone: string; perfil: ContactProfile }) => void;
  pending: boolean;
}) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (nome && telefone) onSubmit({ nome, telefone, perfil: "frio" }); }}
      className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-4"
      style={{ background: "var(--gradient-card)" }}>
      <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" required
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
      <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Telefone" required
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
      <div className="md:col-span-2 flex gap-2">
        <button type="submit" disabled={pending}
          className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          style={{ background: "var(--gradient-primary)" }}>
          {pending ? "Salvando…" : "Adicionar"}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted">
          Cancelar
        </button>
      </div>
    </form>
  );
}

type ChatRow = {
  phone: string;
  name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  message_count: number | null;
  image_url: string | null;
  exists: boolean;
};

function ExtractionPanel({
  onClose, numbersList, funnelsList, extract, importExtract, onImported,
}: {
  onClose: () => void;
  numbersList: () => Promise<Array<{ id: string; nome: string; status: string | null }>>;
  funnelsList: (args: { data: { whatsapp_number_id: string } }) => Promise<Array<{ id: string; name: string }>>;
  extract: (args: { data: { whatsapp_number_id: string } }) => Promise<{ chats: ChatRow[] }>;
  importExtract: (args: { data: { whatsapp_number_id: string; perfil: ContactProfile; welcome_funnel_id: string | null; contacts: ChatRow[] } }) => Promise<{ new_imported: number; already_existed: number }>;
  onImported: () => void;
}) {
  const [numberId, setNumberId] = useState<string>("");
  const [chats, setChats] = useState<ChatRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [perfil, setPerfil] = useState<ContactProfile>("frio");
  const [linkCampaign, setLinkCampaign] = useState(false);
  const [funnelId, setFunnelId] = useState<string>("");
  const [summary, setSummary] = useState<{ new_imported: number; already_existed: number } | null>(null);

  const { data: numbers = [] } = useQuery({ queryKey: ["numbers-extract"], queryFn: () => numbersList() });
  const { data: funnels = [] } = useQuery({
    queryKey: ["funnels-extract", numberId],
    queryFn: () => funnelsList({ data: { whatsapp_number_id: numberId } }),
    enabled: !!numberId && showOptions && linkCampaign,
  });

  const extractMut = useMutation({
    mutationFn: () => extract({ data: { whatsapp_number_id: numberId } }),
    onSuccess: (r) => { setChats(r.chats); setSelected(new Set(r.chats.map((c) => c.phone))); },
  });
  const importMut = useMutation({
    mutationFn: () => {
      const list = (chats ?? []).filter((c) => selected.has(c.phone));
      return importExtract({ data: { whatsapp_number_id: numberId, perfil, welcome_funnel_id: linkCampaign && funnelId ? funnelId : null, contacts: list } });
    },
    onSuccess: (r) => { setSummary(r); onImported(); },
  });

  const filtered = (chats ?? []).filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.name?.toLowerCase().includes(s) ?? false) || c.phone.includes(search);
  });

  function toggle(p: string) {
    const n = new Set(selected);
    if (n.has(p)) n.delete(p); else n.add(p);
    setSelected(n);
  }
  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.phone)));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="relative flex h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Extração de conversas</h2>
            <p className="text-xs text-muted-foreground">Busca todos os chats do número conectado via WhatsApp</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </header>

        {summary ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-success" />
            <h3 className="text-xl font-semibold">Importação concluída</h3>
            <p className="text-muted-foreground">
              <strong className="text-foreground">{summary.new_imported}</strong> novos, {" "}
              <strong className="text-foreground">{summary.already_existed}</strong> já existiam
            </p>
            <button onClick={onClose} className="rounded-lg px-5 py-2.5 text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}>Fechar</button>
          </div>
        ) : showOptions ? (
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
            <div>
              <p className="mb-2 text-sm font-medium">Qual perfil atribuir aos {selected.size} contatos?</p>
              <div className="grid grid-cols-3 gap-2">
                {(["frio", "inativo", "ativo"] as const).map((p) => (
                  <button key={p} onClick={() => setPerfil(p)}
                    className={`rounded-lg border px-3 py-2.5 text-sm transition ${perfil === p ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-muted"}`}>
                    {p === "frio" ? "Lead Frio" : p === "inativo" ? "Cliente Inativo" : "Cliente Ativo"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={linkCampaign} onChange={(e) => setLinkCampaign(e.target.checked)} />
                Adicionar a uma campanha de disparo
              </label>
              {linkCampaign && (
                <select value={funnelId} onChange={(e) => setFunnelId(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">Selecione um funil…</option>
                  {funnels.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              )}
            </div>
            <div className="mt-auto flex gap-2 border-t border-border pt-4">
              <button onClick={() => setShowOptions(false)}
                className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm hover:bg-muted">Voltar</button>
              <button onClick={() => importMut.mutate()} disabled={importMut.isPending || (linkCampaign && !funnelId)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                style={{ background: "var(--gradient-primary)" }}>
                {importMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar importação
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
              <select value={numberId} onChange={(e) => { setNumberId(e.target.value); setChats(null); }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="">Selecione um número…</option>
                {numbers.map((n) => (
                  <option key={n.id} value={n.id}>{n.nome} {n.status === "conectado" ? "✓" : ""}</option>
                ))}
              </select>
              <button onClick={() => extractMut.mutate()} disabled={!numberId || extractMut.isPending}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                style={{ background: "var(--gradient-primary)" }}>
                {extractMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Extrair conversas
              </button>
              {chats && (
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…"
                  className="ml-auto w-48 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              )}
            </div>
            {extractMut.error && (
              <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {(extractMut.error as Error).message}
              </div>
            )}
            {chats ? (
              <>
                <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} />
                    {selected.size} de {filtered.length} selecionados
                  </label>
                  <span>{chats.filter((c) => c.exists).length} já no banco</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filtered.map((c) => (
                    <label key={c.phone} className="flex items-start gap-3 border-b border-border/50 px-4 py-3 hover:bg-muted/30">
                      <input type="checkbox" checked={selected.has(c.phone)} onChange={() => toggle(c.phone)} className="mt-1" />
                      {c.image_url ? (
                        <img src={c.image_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                          {(c.name?.[0] ?? c.phone[0] ?? "?").toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{c.name || c.phone}</span>
                          {c.exists && <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] text-warning">já existe</span>}
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">{c.phone}</div>
                        {c.last_message && <div className="truncate text-xs text-muted-foreground mt-0.5">{c.last_message}</div>}
                      </div>
                      <div className="text-right text-[11px] text-muted-foreground whitespace-nowrap">
                        {c.last_message_at && new Date(c.last_message_at).toLocaleDateString("pt-BR")}
                        {c.message_count !== null && <div>{c.message_count} msgs</div>}
                      </div>
                    </label>
                  ))}
                  {filtered.length === 0 && (
                    <div className="py-12 text-center text-sm text-muted-foreground">Nenhuma conversa encontrada</div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-border p-3">
                  <button onClick={() => setShowOptions(true)} disabled={selected.size === 0}
                    className="rounded-lg px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    style={{ background: "var(--gradient-primary)" }}>
                    Importar {selected.size} contatos
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-12 text-center text-sm text-muted-foreground">
                {extractMut.isPending ? "Buscando chats…" : "Selecione um número conectado e clique em Extrair conversas"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
