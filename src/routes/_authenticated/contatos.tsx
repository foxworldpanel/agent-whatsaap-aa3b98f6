import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Upload, Search, Filter } from "lucide-react";
import { mockContacts, profileLabel, statusLabel, type ContactProfile, type ContactStatus } from "@/lib/mock-data";

export const Route = createFileRoute("/_authenticated/contatos")({
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

function Contatos() {
  const [search, setSearch] = useState("");
  const [perfilFilter, setPerfilFilter] = useState<ContactProfile | "todos">("todos");
  const [statusFilter, setStatusFilter] = useState<ContactStatus | "todos">("todos");

  const filtered = mockContacts.filter((c) => {
    if (perfilFilter !== "todos" && c.perfil !== perfilFilter) return false;
    if (statusFilter !== "todos" && c.status !== statusFilter) return false;
    if (search && !c.nome.toLowerCase().includes(search.toLowerCase()) && !c.telefone.includes(search))
      return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Base de contatos</p>
          <h1 className="text-3xl font-bold tracking-tight">Contatos</h1>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
        >
          <Upload className="h-4 w-4" />
          Importar CSV
        </button>
      </header>

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
        <FilterSelect
          value={perfilFilter}
          onChange={(v) => setPerfilFilter(v as ContactProfile | "todos")}
          options={[["todos", "Todos os perfis"], ...Object.entries(profileLabel)]}
        />
        <FilterSelect
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as ContactStatus | "todos")}
          options={[["todos", "Todos os status"], ...Object.entries(statusLabel)]}
        />
      </div>

      <div
        className="overflow-hidden rounded-xl border border-border"
        style={{ background: "var(--gradient-card)" }}
      >
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-3 text-left font-medium">Nome</th>
              <th className="px-5 py-3 text-left font-medium">Telefone</th>
              <th className="px-5 py-3 text-left font-medium">Perfil</th>
              <th className="px-5 py-3 text-left font-medium">Status</th>
              <th className="px-5 py-3 text-left font-medium">Última interação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((c) => (
              <tr key={c.id} className="transition hover:bg-muted/20">
                <td className="px-5 py-3 font-medium">{c.nome}</td>
                <td className="px-5 py-3 text-muted-foreground tabular-nums">{c.telefone}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs ${profileColor[c.perfil]}`}>
                    {profileLabel[c.perfil]}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs ${statusColor[c.status]}`}>
                    {statusLabel[c.status]}
                  </span>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{c.ultimaInteracao ?? "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                  Nenhum contato encontrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <div className="relative">
      <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-border bg-card pl-10 pr-8 py-2.5 text-sm outline-none transition focus:border-primary"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v} className="bg-card">{l}</option>
        ))}
      </select>
    </div>
  );
}