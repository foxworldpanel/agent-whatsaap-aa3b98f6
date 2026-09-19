import { describe,expect,it } from "vitest";import fs from "node:fs";
const webhook=fs.readFileSync("src/routes/api/public/hooks/uazapi-webhook.ts","utf8");const uazapi=fs.readFileSync("src/lib/uazapi.server.ts","utf8");
describe("Audio real Uazapi message id recovery",()=>{
 it("aceita todos os IDs usados pelo adapter Uazapi",()=>{expect(webhook).toContain("m.key_id");expect(webhook).toContain("m.wa_messageid");expect(webhook).toContain("m.key?.id");expect(uazapi).toContain("r?.key_id");expect(uazapi).toContain("r?.wa_messageid");expect(uazapi).toContain("r?.key?.id")});
 it("resolver unificado recupera ID real via message/find",()=>{expect(uazapi).toContain('/message/find');expect(uazapi).toContain("realMessageId: realId");expect(uazapi).toContain("matchingRows.slice(0, 5)")});
 it("download direto só vence quando retorna mídia útil",()=>{expect(uazapi).toContain("Boolean(value.transcription || value.fileURL || value.fileData)");expect(uazapi).toContain("if (useful(direct))")});
 it("faz parsing estrito da resposta para não confundir id/status com transcrição",()=>{expect(uazapi).toContain("findStringByKeys");expect(uazapi).not.toContain("const found = findString(nested")});
 it("segue body canônico do message/download",()=>{expect(uazapi).toContain("id: messageId");expect(uazapi).toContain("transcribe,");expect(uazapi).toContain("openai_apikey: openaiKey")});
});
