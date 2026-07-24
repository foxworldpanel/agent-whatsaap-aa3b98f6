import { describe, expect, it } from "vitest";
import fs from "node:fs";

const ui = fs.readFileSync(
  "src/routes/_authenticated/conversas.tsx",
  "utf8",
);
const sync = fs.readFileSync("src/lib/sync.functions.ts", "utf8");
const uazapi = fs.readFileSync("src/lib/uazapi.server.ts", "utf8");

describe("Conversas Inbox V2", () => {
  it("não monta mais telefone + id/nome técnico na mesma linha", () => {
    expect(ui).not.toContain('`${phone} · ${name}`');
    expect(ui).toContain("contactPrimaryLabel");
    expect(ui).toContain("formatPhone");
  });

  it("esconde IDs internos longos", () => {
    expect(ui).toContain("Telefone não identificado");
    expect(ui).toContain("isLikelyInternalWhatsAppId");
  });

  it("avatar quebrado cai para iniciais", () => {
    expect(ui).toContain("function ContactAvatar");
    expect(ui).toContain("onError={() => setFailed(true)}");
  });

  it("possui filtros rápidos comerciais", () => {
    expect(ui).toContain('"human"');
    expect(ui).toContain('"meta"');
    expect(ui).toContain('"hot"');
  });

  it("Lead Intelligence vazio fica compacto", () => {
    expect(ui).toContain("aguardando primeira análise do Agent V3");
  });

  it("sincronização faz backfill de fotos antigas", () => {
    expect(sync).toContain("missingPhotoConvs");
    expect(sync).toContain("uazapiGetProfilePic");
  });

  it("chat/find não usa @lid como telefone", () => {
    expect(uazapi).toContain('!id.includes("@lid")');
    expect(uazapi).toContain("chat sem telefone real; ignorando LID interno");
  });
});
