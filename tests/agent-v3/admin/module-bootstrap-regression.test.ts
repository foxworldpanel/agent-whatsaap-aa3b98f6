import { describe, expect, it } from "vitest";
import fs from "node:fs";

const admin = fs.readFileSync("src/lib/agent-v3/admin/admin.functions.ts", "utf8");

describe("CMS modular bootstrap", () => {
  it("executa bootstrap antes de listar módulos", () => {
    expect(admin).toContain("await ensurePlatformSubmodulesV3({");
  });

  it("cria submódulos Spotify", () => {
    for (const key of [
      "spotify_servicos","spotify_precos","spotify_prazos","spotify_links",
      "spotify_ouvintes","spotify_garantia","spotify_playlists","spotify_royalties",
    ]) expect(admin).toContain(`key: "${key}"`);
  });

  it("preserva o conteúdo atual do YouTube", () => {
    expect(admin).toContain('const youtubeLegacy = existing.get("youtube")');
    expect(admin).toContain("content: youtubeLegacy.content");
  });

  it("é idempotente", () => {
    expect(admin).toContain('onConflict: "workspace_id,key"');
    expect(admin).toContain("ignoreDuplicates: true");
  });
});
