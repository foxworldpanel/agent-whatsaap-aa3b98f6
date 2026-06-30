// Sistema de variação inteligente para disparos.
// Detecta horário (timezone Brasil) e monta saudação + corpo aleatório.

export const SAUDACOES: Record<"manha" | "tarde" | "noite", string[]> = {
  manha: [
    "Oi, bom dia! Tudo bem?",
    "Bom dia! Tudo certo?",
    "Olá, bom dia!",
    "Bom dia, tudo bem?",
    "Oi! Bom dia, como vai?",
  ],
  tarde: [
    "Oi, boa tarde! Tudo bem?",
    "Boa tarde! Tudo certo?",
    "Olá, boa tarde!",
    "Boa tarde, tudo bem?",
  ],
  noite: [
    "Oi, boa noite! Tudo bem?",
    "Boa noite! Tudo certo?",
    "Olá, boa noite!",
  ],
};

export const CORPOS_MENSAGEM: string[] = [
  "Vi seu perfil @{instagram} no Instagram, curti o conteúdo! Posso te mostrar uma coisa rapidinho?",
  "Dei uma olhada no seu Instagram @{instagram}, gostei bastante! Tenho algo rápido pra te mostrar, pode ser?",
  "Encontrei seu perfil @{instagram}, muito bom o conteúdo! Posso te falar uma coisa rapidinho?",
  "Vi seu Instagram @{instagram} por aqui, curti! Tenho algo interessante pra te mostrar, posso?",
];

export function getPeriodoBrasil(now: Date = new Date()): "manha" | "tarde" | "noite" {
  // Hora atual em America/Sao_Paulo
  const horaStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  }).format(now);
  const hora = parseInt(horaStr, 10);
  if (hora >= 5 && hora < 12) return "manha";
  if (hora >= 12 && hora < 18) return "tarde";
  return "noite";
}

export type VariationPick = {
  periodo: "manha" | "tarde" | "noite";
  saudacaoIdx: number;
  corpoIdx: number;
  key: string;
  text: string;
};

function makeKey(periodo: string, sIdx: number, cIdx: number) {
  return `${periodo}:${sIdx}:${cIdx}`;
}

export function montarMensagemDisparo(
  nome: string,
  instagram: string,
  options: { avoidKey?: string | null; now?: Date } = {},
): VariationPick {
  const periodo = getPeriodoBrasil(options.now);
  const saudacoes = SAUDACOES[periodo];
  const corpos = CORPOS_MENSAGEM;

  // tenta até 6 vezes evitar a combinação anterior
  let sIdx = 0;
  let cIdx = 0;
  let key = "";
  for (let i = 0; i < 6; i++) {
    sIdx = Math.floor(Math.random() * saudacoes.length);
    cIdx = Math.floor(Math.random() * corpos.length);
    key = makeKey(periodo, sIdx, cIdx);
    if (key !== options.avoidKey) break;
  }

  const text = `${saudacoes[sIdx]}\n\n${corpos[cIdx]}`
    .replace(/\{nome\}/gi, nome ?? "")
    .replace(/\{instagram\}/gi, instagram ?? "");

  return { periodo, saudacaoIdx: sIdx, corpoIdx: cIdx, key, text };
}

// Exemplos para o painel
export function listarExemplos(): Array<{ periodo: string; exemplos: string[] }> {
  return (["manha", "tarde", "noite"] as const).map((p) => ({
    periodo: p,
    exemplos: SAUDACOES[p].flatMap((s) =>
      CORPOS_MENSAGEM.map((c) => `${s}\n\n${c.replace("{instagram}", "perfil_exemplo")}`),
    ),
  }));
}