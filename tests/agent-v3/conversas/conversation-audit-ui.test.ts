import { describe, expect, it } from "vitest";
import fs from "node:fs";

const ui = fs.readFileSync("src/routes/_authenticated/conversas.tsx", "utf8");
const whatsapp = fs.readFileSync("src/lib/whatsapp.functions.ts", "utf8");
const sync = fs.readFileSync("src/lib/sync.functions.ts", "utf8");
const webhook = fs.readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts", "utf8");

describe("Conversas audit center", () => {
  it("exibe Lead Intelligence real do último turno V3", () => {
    expect(whatsapp).toContain('.eq("type", "agent_v3_turn")');
    expect(whatsapp).toContain("metadata.intelligence");
    expect(ui).toContain("Lead Intelligence");
    expect(ui).toContain("Probabilidade de Compra");
    expect(ui).toContain("Confiança");
    expect(ui).toContain("Intenção");
    expect(ui).toContain("Estágio");
    expect(ui).toContain("Sentimento");
    expect(ui).toContain("Urgência");
  });

  it("pagina conversas e mensagens para não parar em 1000 registros", () => {
    expect(whatsapp).toContain(".range(from, from + pageSize - 1)");
    expect(whatsapp).toContain("const allRows: any[] = []");
  });

  it("sincroniza todos os chats e atualiza fotos", () => {
    expect(sync).toContain("uazapiListChats");
    expect(sync).toContain("uazapiGetProfilePic");
    expect(sync).not.toContain(".limit(50)");
    expect(sync).toContain("photo_url: imageUrl");
  });

  it("hidrata foto também quando chega contato novo no webhook", () => {
    expect(webhook).toContain("uazapiGetProfilePic");
    expect(webhook).toContain(".update({ photo_url: profilePic })");
  });

  it("copia a conversa completa com transcrições", () => {
    expect(ui).toContain("copyFullConversation");
    expect(ui).toContain("[ÁUDIO / TRANSCRIÇÃO]");
    expect(ui).toContain("Conversa completa copiada.");
  });
});
