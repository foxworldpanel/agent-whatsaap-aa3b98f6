import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Search, Filter, Plus, Trash2, Flame, Thermometer, Snowflake, Ban } from "lucide-react";
import { profileLabel, statusLabel, type ContactProfile, type ContactStatus } from "@/lib/mock-data";
import { listContacts, importContacts, createContact, deleteContact } from "@/lib/contacts.functions";

export const Route = createFileRoute("/_authenticated/contatos")({
  ssr: false,
  head: () => ({ meta: [{ title: "Contatos · ZapAgent" }] }),
  component: Contatos,
});

const statusColor: Record<ContactStatus, string> = {
  nao_abordado: "bg-muted text-muted-foreground",
  em_conversa: "bg-primary/20 text-primary",
  convertido: "bg-success/20 text-success",
  sem_resposta: "bg-warning/20 text-warning",
  bloqueado: "bg-destructive/20 text-destructive",
};

const profileColor: Record<ContactProfile, string> = {
  ativo: "bg-success/15 text-success border-success/30",
  frio: "bg-primary/15 text-primary border-primary/30",
  inativo: "bg-warning/15 text-warning border-warning/30",
};

type Temperatura = "quente" | "morno" | "frio" | "bloqueado";
const tempMeta: Record<Temperatura, { label: string; cls: string; Icon: typeof Flame }> = {
  quente:    { label: "Quente",    cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: Flame },
  morno:     { label: "Morno",     cls: "bg-warning/15 text-warning border-warning/30",             Icon: Thermometer },
  frio:      { label: "Frio",      cls: "bg-primary/15 text-primary border-primary/30",             Icon: Snowflake },
  bloqueado: { label: "Bloqueado", cls: "bg-muted text-muted-foreground border-border",             Icon: Ban },
};

function Contatos() {
  const qc = useQueryClient();
  const list = useServerFn(listContacts);
  const imp = useServerFn(importContacts);
  const create = useServerFn(createContact);
  const del = useServerFn(deleteContact);
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [perfilFilter, setPerfilFilter] = useState<ContactProfile | "todos">("todos");
  const [statusFilter, setStatusFilter] = useState<ContactStatus | "todos">("todos");
  const [tempFilter, setTempFilter] = useState<Temperatura | "todos">("todos");
  const [showAdd, setShowAdd] = useState(false);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => list(),
  });

  const importMut = useMutation({
    mutationFn: (rows: { nome: string; telefone: string; perfil: ContactProfile }[]) =>
      imp({ data: { rows } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });

  const createMut = useMutation({
    mutationFn: (input: { nome: string; telefone: string; perfil: ContactProfile }) =>
      create({ data: { ...input, status: "nao_abordado" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setShowAdd(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });

  const filtered = contacts.filter((c) => {
    if (perfilFilter !== "todos" && c.perfil !== perfilFilter) return false;
    if (statusFilter !== "todos" && c.status !== statusFilter) return false;
    if (tempFilter !== "todos" && (c as { temperatura?: string }).temperatura !== tempFilter) return false;
    if (search && !c.nome.toLowerCase().includes(search.toLowerCase()) && !c.telefone.includes(search))
      return false;
    return true;
  });

  async function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const rows: { nome: string; telefone: string; perfil: ContactProfile }[] = [];
    for (const line of lines) {
      const [nome, telefone, perfil] = line.split(",").map((s) => s?.trim());
      if (!nome || !telefone) continue;
      if (nome.toLowerCase() === "nome") continue;
      const p = (["ativo", "frio", "inativo"] as const).includes(perfil as ContactProfile)
        ? (perfil as ContactProfile)
        : "frio";
      rows.push({ nome, telefone, perfil: p });
    }
    if (rows.length) importMut.mutate(rows);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Base de contatos</p>
          <h1 className="text-3xl font-bold tracking-tight">Contatos</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAdd((s) => !s)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            Novo
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsv} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importMut.isPending}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-60"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
          >
            <Upload className="h-4 w-4" />
            {importMut.isPending ? "Importando…" : "Importar CSV"}
          </button>
        </div>
      </header>

      {showAdd && (
        <AddForm onCancel={() => setShowAdd(false)} onSubmit={(v) => createMut.mutate(v)} pending={createMut.isPending} />
      )}

      <p className="text-xs text-muted-foreground">
        CSV: <code className="rounded bg-muted px-1.5 py-0.5">nome,telefone,perfil</code> · perfil = ativo | frio | inativo
      </p>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone…"
            className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2.5 text-sm outline-none transition focus:border-primary"
          />
        </div>
        <FilterSelect value={perfilFilter} onChange={(v) => setPerfilFilter(v as ContactProfile | "todos")}
          options={[["todos", "Todos os perfis"], ...Object.entries(profileLabel)]} />
        <FilterSelect value={statusFilter} onChange={(v) => setStatusFilter(v as ContactStatus | "todos")}
          options={[["todos", "Todos os status"], ...Object.entries(statusLabel)]} />
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5">
          <button
            onClick={() => setTempFilter("todos")}
            className={`rounded-md px-2 py-1 text-xs font-medium ${tempFilter === "todos" ? "bg-muted" : "text-muted-foreground hover:bg-muted/50"}`}
          >
            Todas
          </button>
          {(Object.keys(tempMeta) as Temperatura[]).map((t) => {
            const { Icon, label, cls } = tempMeta[t];
            const active = tempFilter === t;
            return (
              <button
                key={t}
                onClick={() => setTempFilter(active ? "todos" : t)}
                title={label}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition ${cls} ${active ? "ring-2 ring-offset-1 ring-offset-card" : "opacity-70 hover:opacity-100"}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border" style={{ background: "var(--gradient-card)" }}>
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-3 text-left font-medium">Nome</th>
              <th className="px-5 py-3 text-left font-medium">Telefone</th>
              <th className="px-5 py-3 text-left font-medium">Perfil</th>
              <th className="px-5 py-3 text-left font-medium">Temperatura</th>
              <th className="px-5 py-3 text-left font-medium">Status</th>
              <th className="px-5 py-3 text-left font-medium">Última interação</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((c) => (
              <tr key={c.id} className="transition hover:bg-muted/20">
                <td className="px-5 py-3 font-medium">{c.nome}</td>
                <td className="px-5 py-3 text-muted-foreground tabular-nums">{c.telefone}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs ${profileColor[c.perfil as ContactProfile]}`}>
                    {profileLabel[c.perfil as ContactProfile]}
                  </span>
                </td>
                <td className="px-5 py-3">
                  {(() => {
                    const t = ((c as { temperatura?: string }).temperatura ?? "frio") as Temperatura;
                    const meta = tempMeta[t] ?? tempMeta.frio;
                    const Icon = meta.Icon;
                    return (
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${meta.cls}`}>
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs ${statusColor[c.status as ContactStatus]}`}>
                    {statusLabel[c.status as ContactStatus]}
                  </span>
                </td>
                <td className="px-5 py-3 text-muted-foreground">
                  {c.last_interaction_at ? new Date(c.last_interaction_at).toLocaleString("pt-BR") : "—"}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => deleteMut.mutate(c.id)}
                    className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">Nenhum contato encontrado</td></tr>
            )}
            {isLoading && (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">Carregando…</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
  const [perfil, setPerfil] = useState<ContactProfile>("frio");

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (nome && telefone) onSubmit({ nome, telefone, perfil }); }}
      className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-4"
      style={{ background: "var(--gradient-card)" }}
    >
      <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" required
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
      <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Telefone" required
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
      <select value={perfil} onChange={(e) => setPerfil(e.target.value as ContactProfile)}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
        {Object.entries(profileLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <div className="flex gap-2">
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

function FilterSelect({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <div className="relative">
      <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-border bg-card pl-10 pr-8 py-2.5 text-sm outline-none transition focus:border-primary">
        {options.map(([v, l]) => <option key={v} value={v} className="bg-card">{l}</option>)}
      </select>
    </div>
  );
}
