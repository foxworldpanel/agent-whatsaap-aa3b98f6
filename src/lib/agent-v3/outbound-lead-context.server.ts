export type OutboundLeadContext = {
  source: "lead_finder";
  instagram: string;
  segment: string;
};

export function normalizeOutboundLeadContext(value: unknown): OutboundLeadContext | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const instagram = String(row.instagram ?? row.profile_username ?? "").trim().replace(/^@+/, "");
  const segment = String(row.segment ?? row.segmento ?? "").trim();
  if (!instagram || !segment) return null;
  return { source: "lead_finder", instagram, segment };
}

export function outboundLeadPromptContext(context: OutboundLeadContext | null | undefined): string {
  if (!context) return "";
  return [
    "ORIGEM ESTRUTURADA DO DISPARO (fato persistido; nunca inventar):",
    "- origem: Lead Finder",
    `- Instagram de origem: @${context.instagram}`,
    `- segmento: ${context.segment}`,
    "Se perguntarem onde o contato foi encontrado, responda diretamente com o Instagram de origem acima.",
  ].join("\n");
}
