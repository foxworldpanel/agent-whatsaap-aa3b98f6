import { describe, it, expect } from "vitest";
import { selectRelevantFaqs } from "@/lib/ai.server";

const FAQS = [
  { q: "Como faço para me cadastrar no painel?", a: "Entra em mindsmmpanel.com, clica em cadastrar e preenche o formulário." },
  { q: "Como pago?", a: "Aceitamos PIX via depósito no painel." },
  { q: "Quanto tempo leva a entrega?", a: "Entrega gradual, de 24h a 72h dependendo do serviço." },
  { q: "É seguro? Não vai bloquear minha conta?", a: "Sim, trabalhamos com contas reais e entrega gradual — não viola termos." },
  { q: "Vocês têm garantia?", a: "Sim, refil grátis em caso de queda até 30 dias." },
  { q: "Aceitam cartão de crédito?", a: "Ainda não — só PIX por enquanto." },
];

describe("ETAPA 4 — FAQ sob demanda", () => {
  it("pergunta sobre cadastro → traz FAQ de cadastro", () => {
    const r = selectRelevantFaqs(FAQS, "como faço pra cadastrar?");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].q).toMatch(/cadastrar/i);
  });

  it("pergunta sobre pagamento → traz FAQ de pagamento", () => {
    const r = selectRelevantFaqs(FAQS, "como pago via pix?");
    expect(r.some((f) => /pag/i.test(f.q))).toBe(true);
  });

  it("pergunta sobre confiança → traz FAQ de segurança", () => {
    const r = selectRelevantFaqs(FAQS, "é seguro? não vai bloquear minha conta do instagram?");
    expect(r.some((f) => /seguro|bloqu/i.test(f.q))).toBe(true);
  });

  it("pergunta sem relação com FAQs → retorna vazio", () => {
    const r = selectRelevantFaqs(FAQS, "você viu o jogo do corinthians ontem?");
    expect(r).toEqual([]);
  });

  it("saudação curta → retorna vazio (LLM não recebe FAQ ruído)", () => {
    expect(selectRelevantFaqs(FAQS, "oi")).toEqual([]);
    expect(selectRelevantFaqs(FAQS, "bom dia")).toEqual([]);
  });

  it("respeita cap (max=5 default)", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      q: `Pergunta ${i} sobre pagamento pix`,
      a: `Resposta ${i} sobre pagamento pix`,
    }));
    const r = selectRelevantFaqs(many, "como pago via pix?");
    expect(r.length).toBeLessThanOrEqual(5);
  });

  it("input vazio de FAQs → []", () => {
    expect(selectRelevantFaqs([], "qualquer coisa")).toEqual([]);
  });
});