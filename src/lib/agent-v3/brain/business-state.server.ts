export type BusinessStateV3 =
  | "novo_lead"
  | "descoberta"
  | "orcamento"
  | "fechamento"
  | "pagamento"
  | "compra_bloqueada"
  | "pedido_realizado"
  | "pos_venda"
  | "reclamacao"
  | "adiado"
  | "abandono"
  | "aguardando_setor";

export type RiskLevelV3 = "normal" | "atencao" | "alto" | "humano_obrigatorio";

export type BusinessDecisionV3 = {
  state: BusinessStateV3;
  risk: RiskLevelV3;
  reason: string;
  nextAction: string;
  allowQualification: boolean;
  shouldHandoff: boolean;
};

function norm(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function deriveBusinessDecisionV3(params: {
  message: string;
  recentCustomerMessages?: string[];
  customerLifecycle?: string | null;
}): BusinessDecisionV3 {
  const current = norm(params.message);
  const recent = (params.recentCustomerMessages || []).slice(-6).map(norm);
  const context = [...recent, current].filter(Boolean).join(" ");

  const explicitHuman =
    /\b(falar com (?:um |uma )?(?:atendente )?humano|falar com (?:uma )?pessoa|quero (?:um |uma )?atendente|sem ser (?:um )?robo|sem robo|pessoa de verdade)\b/.test(current);
  if (explicitHuman) {
    return {
      state: "aguardando_setor",
      risk: "humano_obrigatorio",
      reason: "cliente solicitou outro atendente",
      nextAction: "pausar o atendimento automático e encaminhar ao setor responsável",
      allowQualification: false,
      shouldHandoff: true,
    };
  }

  const legalRisk =
    /\b(denuncia|procon|advogad|processo|processar|justica|chargeback|contestacao|fraude|golpe)\b/.test(current);
  if (legalRisk) {
    return {
      state: "reclamacao",
      risk: "humano_obrigatorio",
      reason: "risco jurídico ou reputacional",
      nextAction: "encaminhar imediatamente ao setor responsável",
      allowQualification: false,
      shouldHandoff: true,
    };
  }

  const resolution =
    /\b(agora deu certo|agora funcionou|agora consegui|ja consegui|deu certo|funcionou|saldo apareceu|resolvido)\b/.test(current);
  const newPurchase =
    /\b(quero comprar|quero fazer|vou comprar|vou fazer|manda o pix|qual o pix|quero pagar|onde pago|mais \d+|novo pedido|outra compra)\b/.test(current);

  const paymentTopic =
    /\b(cadastro|cadastrar|pix|pagamento|recarga|saldo|finalizar|pedido|comprar)\b/.test(context);
  const currentProblem =
    /\b(nao funciona|nao abre|nao aparece|nao completa|nao consigo|nao avanca|nao finaliza|erro|trav|muito complicado|volta|alto risco|transacao de alto risco)\b/.test(current);

  const priorTroubleshooting =
    (context.match(/\b(cache|cookie|navegador|ticket|atualiz|tente novamente|cadastro|pagamento)\b/g) || []).length >= 3;

  if (!resolution && !newPurchase && paymentTopic && currentProblem && priorTroubleshooting) {
    return {
      state: "compra_bloqueada",
      risk: "humano_obrigatorio",
      reason: "venda bloqueada por problema técnico persistente",
      nextAction: "pausar e encaminhar ao setor responsável",
      allowQualification: false,
      shouldHandoff: true,
    };
  }

  if (!resolution && paymentTopic && currentProblem) {
    return {
      state: "compra_bloqueada",
      risk: "alto",
      reason: "cliente tentando comprar com problema técnico",
      nextAction: "dar uma única orientação simples; se persistir, encaminhar",
      allowQualification: false,
      shouldHandoff: false,
    };
  }

  if (/\b(deixa pra la|deixa para la|desisti|nao quero mais|vou deixar pra outra hora|vou deixar para outra hora)\b/.test(current)) {
    return {
      state: "abandono",
      risk: paymentTopic ? "alto" : "atencao",
      reason: "cliente interrompeu o avanço da compra",
      nextAction: "encerrar sem pressionar e registrar abandono/adiamento",
      allowQualification: false,
      shouldHandoff: false,
    };
  }

  if (/\b(mais tarde|depois eu volto|depois das \d|amanha|agora nao posso|estou trabalhando|vou ver depois|mais pra frente|mais para frente)\b/.test(current)) {
    return {
      state: "adiado",
      risk: "normal",
      reason: "cliente pediu para continuar depois",
      nextAction: "responder curto e não fazer nova pergunta comercial",
      allowQualification: false,
      shouldHandoff: false,
    };
  }

  if (/\b(ja comprei|ja paguei|comprei ontem|comprei hoje|comprei|paguei|fiz o pedido|pedido feito|pedido realizado|pagamento feito|pagamento realizado)\b/.test(current)) {
    return {
      state: "pedido_realizado",
      risk: "normal",
      reason: "cliente confirmou compra/pedido",
      nextAction: "entrar em pós-venda e responder apenas a dúvida atual",
      allowQualification: false,
      shouldHandoff: false,
    };
  }

  if (/\b(pedido|nao chegou|caiu|reposicao|garantia|demora|quanto tempo|concluido|processando)\b/.test(current) &&
      (params.customerLifecycle === "cliente" || params.customerLifecycle === "cliente_recorrente")) {
    return {
      state: "pos_venda",
      risk: currentProblem ? "atencao" : "normal",
      reason: "cliente existente tratando de pedido/entrega",
      nextAction: "atender pós-venda sem reiniciar qualificação",
      allowQualification: false,
      shouldHandoff: false,
    };
  }

  const sentPlatformLink =
    /https?:\/\/(?:open\.)?spotify\.com\/(?:track|album|artist|playlist)\//.test(current) ||
    /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//.test(current) ||
    /https?:\/\/(?:www\.)?instagram\.com\//.test(current) ||
    /https?:\/\/(?:www\.)?tiktok\.com\//.test(current);

  const priorServiceChoice =
    /\b(playlist|playlists|plays|ouvintes|seguidores|saves|visualizacoes|likes|curtidas|inscritos|spotify|youtube|instagram|tiktok)\b/.test(context);

  if (sentPlatformLink && priorServiceChoice) {
    return {
      state: "fechamento",
      risk: "normal",
      reason: "cliente já escolheu o serviço e enviou o link necessário",
      nextAction: "validar o tipo de link quando necessário e avançar para painel/pagamento sem voltar a qualificar",
      allowQualification: false,
      shouldHandoff: false,
    };
  }

  if (/\b(manda o pix|qual o pix|quero pagar|onde pago|vou pagar|pagamento)\b/.test(current)) {
    return {
      state: "pagamento",
      risk: "normal",
      reason: "cliente demonstrou intenção clara de pagamento",
      nextAction: "conduzir diretamente ao pagamento/painel",
      allowQualification: false,
      shouldHandoff: false,
    };
  }

  if (/\b(quero \d|mil|500|1000|2000|seguidores|visualizacoes|plays|likes|curtidas)\b/.test(current) &&
      /\b(quero|vou fazer|fica|quanto|preco|valor)\b/.test(context)) {
    return {
      state: "fechamento",
      risk: "normal",
      reason: "cliente já definiu produto/quantidade ou está fechando",
      nextAction: "calcular/confirmar valor e avançar para pagamento",
      allowQualification: false,
      shouldHandoff: false,
    };
  }

  if (/\b(preco|valor|quanto custa|quanto fica|pacote)\b/.test(current)) {
    return {
      state: "orcamento",
      risk: "normal",
      reason: "cliente pesquisando preço/pacote",
      nextAction: "responder apenas com dados do módulo autoritativo",
      allowQualification: false,
      shouldHandoff: false,
    };
  }

  if (/\b(spotify|youtube|instagram|tiktok|kwai|facebook|divulgar|divulgacao|musica|video)\b/.test(current)) {
    return {
      state: "descoberta",
      risk: "normal",
      reason: "cliente explorando plataforma/necessidade",
      nextAction: "entender o objetivo com no máximo uma pergunta",
      allowQualification: true,
      shouldHandoff: false,
    };
  }

  return {
    state: params.customerLifecycle === "cliente" || params.customerLifecycle === "cliente_recorrente"
      ? "descoberta"
      : "novo_lead",
    risk: "normal",
    reason: "estado inicial/indefinido",
    nextAction: "responder ao último pedido sem inventar informação",
    allowQualification: true,
    shouldHandoff: false,
  };
}

export function businessDecisionToPromptV3(decision: BusinessDecisionV3): string {
  return [
    "DECISÃO DE NEGÓCIO DO RUNTIME:",
    `- Estado atual: ${decision.state}`,
    `- Risco: ${decision.risk}`,
    `- Motivo: ${decision.reason}`,
    `- Próxima ação permitida: ${decision.nextAction}`,
    `- Pode voltar a qualificar: ${decision.allowQualification ? "sim" : "não"}`,
    "- Esta decisão é superior a improvisações do modelo. Não volte para etapas anteriores do funil quando allowQualification = não.",
  ].join("\n");
}
