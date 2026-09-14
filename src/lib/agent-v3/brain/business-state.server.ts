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
  objective?: string;
  purchaseScore?: number;
  confidenceScore?: number;
  urgencyScore?: number;
  waitingCustomer?: boolean;
};

function norm(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isExistingCustomer(lifecycle?: string | null): boolean {
  return lifecycle === "cliente" || lifecycle === "cliente_recorrente";
}

/** Incidente de um pedido/pagamento já feito. A Júlia não investiga isso no WhatsApp. */
function isPostSaleIncident(message: string, lifecycle?: string | null): boolean {
  const current = norm(message);
  const explicitCompletedPurchase = /\b(ja (?:comprei|paguei)|fiz o pedido|pedido (?:feito|realizado)|pagamento (?:feito|realizado)|depois que (?:comprei|paguei)|minha compra|meu pedido)\b/.test(current);
  const operationalProblem = /\b(nao (?:caiu|entrou|chegou|creditou|iniciou|entregou|completou|finalizou)|pendente|atrasad|demora|processando|incomplet|cancelad|reposicao|refill|estorno|reembolso|saldo|recarga|pedido|pagamento|pix)\b/.test(current);
  const strongIncident =
    /\b(?:saldo|recarga|pagamento|pix).{0,55}(?:nao (?:caiu|entrou|chegou|creditou)|pendente|estorno|reembolso|problema|erro)\b/.test(current) ||
    /\b(?:pedido|ordem).{0,55}(?:nao (?:chegou|iniciou|entregou|completou|finalizou)|pendente|atrasad|processando|incomplet|cancelad|reposicao|refill|estorno|reembolso|problema|erro)\b/.test(current) ||
    /\b(?:reposicao|refill|estorno|reembolso).{0,55}(?:pedido|ordem|pagamento|pix|saldo|recarga)\b/.test(current);
  return strongIncident || (isExistingCustomer(lifecycle) && explicitCompletedPurchase && operationalProblem);
}

export function deriveBusinessDecisionV3(params: {
  message: string;
  recentCustomerMessages?: string[];
  customerLifecycle?: string | null;
}): BusinessDecisionV3 {
  const current = norm(params.message);
  const recent = (params.recentCustomerMessages || []).slice(-6).map(norm);
  const context = [...recent, current].filter(Boolean).join(" ");

  const explicitHuman = /\b(falar com (?:um |uma )?(?:atendente )?humano|falar com (?:uma )?pessoa|quero (?:um |uma )?atendente|sem ser (?:um )?robo|sem robo|pessoa de verdade)\b/.test(current);
  if (explicitHuman) return { state: "aguardando_setor", risk: "humano_obrigatorio", reason: "cliente solicitou outro atendente", nextAction: "pausar o atendimento automático e encaminhar ao setor responsável", allowQualification: false, shouldHandoff: true };

  const legalRisk = /\b(denuncia|procon|advogad|processo|processar|justica|chargeback|contestacao|fraude|golpe)\b/.test(current);
  if (legalRisk) return { state: "reclamacao", risk: "humano_obrigatorio", reason: "risco jurídico ou reputacional", nextAction: "encaminhar imediatamente ao setor responsável", allowQualification: false, shouldHandoff: true };

  // Tem prioridade sobre o fluxo de pagamento. "Meu Pix não caiu" não é uma nova venda.
  if (isPostSaleIncident(current, params.customerLifecycle)) {
    return {
      state: "pos_venda",
      risk: "atencao",
      reason: "incidente de pedido/pagamento já realizado",
      nextAction: "não investigar no WhatsApp; orientar imediatamente a abrir ticket em SUPORTE no painel",
      allowQualification: false,
      shouldHandoff: false,
    };
  }

  const resolution = /\b(agora deu certo|agora funcionou|agora consegui|ja consegui|deu certo|funcionou|saldo apareceu|resolvido)\b/.test(current);
  const newPurchase = /\b(quero comprar|quero fazer|vou comprar|vou fazer|manda o pix|qual o pix|quero pagar|onde pago|mais \d+|novo pedido|outra compra)\b/.test(current);
  const paymentTopic = /\b(cadastro|cadastrar|pix|pagamento|recarga|saldo|finalizar|pedido|comprar)\b/.test(context);
  const currentProblem = /\b(nao funciona|nao abre|nao aparece|nao completa|nao consigo|nao avanca|nao finaliza|erro|trav|muito complicado|volta|alto risco|transacao de alto risco)\b/.test(current);
  const priorTroubleshooting = (context.match(/\b(cache|cookie|navegador|ticket|atualiz|tente novamente|cadastro|pagamento)\b/g) || []).length >= 3;

  if (!resolution && !newPurchase && paymentTopic && currentProblem && priorTroubleshooting) return { state: "compra_bloqueada", risk: "humano_obrigatorio", reason: "venda bloqueada por problema técnico persistente", nextAction: "pausar e encaminhar ao setor responsável", allowQualification: false, shouldHandoff: true };
  if (!resolution && paymentTopic && currentProblem) return { state: "compra_bloqueada", risk: "alto", reason: "cliente tentando comprar com problema técnico", nextAction: "dar uma única orientação simples; se persistir, encaminhar", allowQualification: false, shouldHandoff: false };

  if (/\b(deixa pra la|deixa para la|desisti|nao quero mais|vou deixar pra outra hora|vou deixar para outra hora)\b/.test(current)) return { state: "abandono", risk: paymentTopic ? "alto" : "atencao", reason: "cliente interrompeu o avanço da compra", nextAction: "encerrar sem pressionar e registrar abandono/adiamento", allowQualification: false, shouldHandoff: false };
  if (/\b(mais tarde|depois eu volto|depois das \d|amanha|agora nao posso|estou trabalhando|vou ver depois|mais pra frente|mais para frente)\b/.test(current)) return { state: "adiado", risk: "normal", reason: "cliente pediu para continuar depois", nextAction: "responder curto e não fazer nova pergunta comercial", allowQualification: false, shouldHandoff: false };

  if (/\b(ja comprei|ja paguei|comprei ontem|comprei hoje|comprei|paguei|fiz o pedido|pedido feito|pedido realizado|pagamento feito|pagamento realizado)\b/.test(current)) return { state: "pedido_realizado", risk: "normal", reason: "cliente confirmou compra/pedido", nextAction: "entrar em pós-venda e responder apenas a dúvida atual", allowQualification: false, shouldHandoff: false };

  if (/\b(pedido|nao chegou|caiu|reposicao|garantia|demora|quanto tempo|concluido|processando)\b/.test(current) && isExistingCustomer(params.customerLifecycle)) {
    return { state: "pos_venda", risk: currentProblem ? "atencao" : "normal", reason: "cliente existente tratando de pedido/entrega", nextAction: "se houver problema de pedido/pagamento, direcionar ao ticket de SUPORTE sem investigar; caso contrário, responder só a dúvida atual", allowQualification: false, shouldHandoff: false };
  }

  const sentPlatformLink = /https?:\/\/(?:open\.)?spotify\.com\/(?:track|album|artist|playlist)\//.test(current) || /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//.test(current) || /https?:\/\/(?:www\.)?instagram\.com\//.test(current) || /https?:\/\/(?:www\.)?tiktok\.com\//.test(current);
  const priorServiceChoice = /\b(playlist|playlists|plays|ouvintes|seguidores|saves|visualizacoes|likes|curtidas|inscritos|spotify|youtube|instagram|tiktok)\b/.test(context);
  if (sentPlatformLink && priorServiceChoice) return { state: "fechamento", risk: "normal", reason: "cliente já escolheu o serviço e enviou o link necessário", nextAction: "validar o tipo de link quando necessário e avançar para painel/pagamento sem voltar a qualificar", allowQualification: false, shouldHandoff: false };
  if (/\b(manda o pix|qual o pix|quero pagar|onde pago|vou pagar|pagamento)\b/.test(current)) return { state: "pagamento", risk: "normal", reason: "cliente demonstrou intenção clara de pagamento", nextAction: "conduzir diretamente ao pagamento/painel", allowQualification: false, shouldHandoff: false };
  if (/\b(quero \d|mil|500|1000|2000|seguidores|visualizacoes|plays|likes|curtidas)\b/.test(current) && /\b(quero|vou fazer|fica|quanto|preco|valor)\b/.test(context)) return { state: "fechamento", risk: "normal", reason: "cliente já definiu produto/quantidade ou está fechando", nextAction: "calcular/confirmar valor e avançar para pagamento", allowQualification: false, shouldHandoff: false };
  if (/\b(preco|valor|quanto custa|quanto fica|pacote)\b/.test(current)) return { state: "orcamento", risk: "normal", reason: "cliente pesquisando preço/pacote", nextAction: "responder apenas com dados do módulo autoritativo", allowQualification: false, shouldHandoff: false };
  if (/\b(spotify|youtube|instagram|tiktok|kwai|facebook|divulgar|divulgacao|musica|video)\b/.test(current)) return { state: "descoberta", risk: "normal", reason: "cliente explorando plataforma/necessidade", nextAction: "entender o objetivo com no máximo uma pergunta", allowQualification: true, shouldHandoff: false };

  return { state: isExistingCustomer(params.customerLifecycle) ? "descoberta" : "novo_lead", risk: "normal", reason: "estado inicial/indefinido", nextAction: "responder ao último pedido sem inventar informação", allowQualification: true, shouldHandoff: false };
}

export function enrichBusinessDecisionV3(decision: BusinessDecisionV3, message: string): BusinessDecisionV3 {
  const current = norm(message);
  const scoreByState: Record<BusinessStateV3, number> = { novo_lead: 10, descoberta: 35, orcamento: 55, fechamento: 85, pagamento: 95, compra_bloqueada: 90, pedido_realizado: 100, pos_venda: 65, reclamacao: 15, adiado: 40, abandono: 20, aguardando_setor: 10 };
  const urgencyByState: Record<BusinessStateV3, number> = { novo_lead: 20, descoberta: 35, orcamento: 55, fechamento: 75, pagamento: 95, compra_bloqueada: 100, pedido_realizado: 55, pos_venda: 60, reclamacao: 100, adiado: 15, abandono: 25, aguardando_setor: 100 };
  const objective = decision.state === "pagamento" || decision.state === "fechamento"
    ? "concluir a compra sem repetir qualificação"
    : decision.state === "orcamento"
      ? "informar preço e conduzir ao próximo passo"
      : decision.state === "pos_venda" || decision.state === "pedido_realizado"
        ? "proteger o cliente no pós-venda e encaminhar incidentes ao Suporte do painel sem investigar no WhatsApp"
        : decision.state === "reclamacao" || decision.state === "aguardando_setor"
          ? "proteger a experiência e encaminhar para atendimento humano"
          : decision.state === "adiado" ? "aguardar o cliente sem pressionar" : "entender a necessidade com no máximo uma pergunta";
  const waitingCustomer = decision.state === "adiado" || /\b(ok|certo|beleza|entendi|obrigad[oa]|valeu|depois eu volto|mais tarde)\b/.test(current);
  return { ...decision, objective, purchaseScore: scoreByState[decision.state], confidenceScore: decision.reason === "estado inicial/indefinido" ? 45 : 85, urgencyScore: urgencyByState[decision.state], waitingCustomer };
}

export function reconcileBusinessDecisionV3(params: { previous?: BusinessDecisionV3 | null; current: BusinessDecisionV3; message: string }): BusinessDecisionV3 {
  const previous = params.previous;
  const current = params.current;
  const message = norm(params.message);
  if (!previous) return current;
  if (previous.shouldHandoff || previous.risk === "humano_obrigatorio" || previous.state === "aguardando_setor") return { ...previous, reason: `handoff humano preservado: ${previous.reason}`, nextAction: "manter o agente pausado até liberação explícita do operador", waitingCustomer: false };
  if (current.shouldHandoff || current.risk === "humano_obrigatorio") return current;

  // Um incidente de pós-venda atual sempre vence a continuidade de venda antiga.
  if (current.state === "pos_venda" && current.reason.includes("incidente")) return current;

  const explicitNewPurchase = /\b(quero comprar|quero fazer|vou comprar|vou fazer|novo pedido|outra compra|mais \d+|agora consegui|agora funcionou)\b/.test(message);
  const explicitPostSale = /\b(ja comprei|ja paguei|fiz o pedido|pedido feito|pedido realizado|pagamento feito|pagamento realizado)\b/.test(message);
  const explicitDeferral = /\b(mais tarde|depois eu volto|amanha|agora nao posso|vou ver depois|deixa pra la|desisti)\b/.test(message);
  if (explicitNewPurchase || explicitPostSale || explicitDeferral) return current;

  const salesRank: Partial<Record<BusinessStateV3, number>> = { novo_lead: 0, descoberta: 1, orcamento: 2, fechamento: 3, pagamento: 4, pedido_realizado: 5, pos_venda: 6 };
  const previousRank = salesRank[previous.state];
  const currentRank = salesRank[current.state];
  const ambiguousCurrent = current.reason === "estado inicial/indefinido";
  if (previousRank !== undefined && currentRank !== undefined && currentRank < previousRank && (ambiguousCurrent || /^(ok|sim|certo|beleza|entendi|e agora|como assim|pode ser|isso)$/i.test(message))) return { ...previous, reason: `continuidade preservada: ${previous.reason}`, waitingCustomer: false };

  if ((previous.state === "pagamento" || previous.state === "fechamento") && ["novo_lead", "descoberta", "orcamento"].includes(current.state) && /\b(como|onde|qual|pix|painel|cadastro|saldo|recarga|demora|prazo|garantia|seguro|funciona)\b/.test(message)) {
    return { ...previous, reason: `continuidade de ${previous.state}: dúvida operacional do cliente`, nextAction: previous.state === "pagamento" ? "responder a dúvida e manter o cliente no pagamento/painel" : "responder a dúvida e continuar o fechamento sem repetir qualificação", waitingCustomer: false };
  }
  return current;
}

export function businessDecisionToPromptV3(decision: BusinessDecisionV3): string {
  return [
    "DECISÃO DE NEGÓCIO DO RUNTIME:",
    `- Estado atual: ${decision.state}`,
    `- Risco: ${decision.risk}`,
    `- Motivo: ${decision.reason}`,
    `- Próxima ação permitida: ${decision.nextAction}`,
    `- Pode voltar a qualificar: ${decision.allowQualification ? "sim" : "não"}`,
    `- Objetivo ativo: ${decision.objective || "responder ao último pedido"}`,
    `- Score de compra: ${decision.purchaseScore ?? 0}%`,
    `- Confiança do estado: ${decision.confidenceScore ?? 0}%`,
    `- Urgência: ${decision.urgencyScore ?? 0}%`,
    `- Aguardando cliente: ${decision.waitingCustomer ? "sim" : "não"}`,
    decision.waitingCustomer ? "- Não envie nova pergunta, nova oferta ou cobrança. Aguarde a próxima mensagem do cliente." : "- Termine com apenas uma próxima ação coerente com o estágio atual.",
    "- Esta decisão é superior a improvisações do modelo. Não volte para etapas anteriores do funil quando allowQualification = não.",
  ].join("\n");
}