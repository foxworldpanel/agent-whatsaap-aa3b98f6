import { supabaseAdmin } from './src/integrations/supabase/client.server';
import { DEFAULT_MODULES_V3 } from './src/lib/agent-v3/default-modules-v3.server';

const WORKSPACE_ID = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa"; // Mind SMM Panel
const USER_ID = "f8da521a-e8db-4efe-8c9b-9bd69749c0a7"; // Mind SMM User

const MODULE_DEFINITIONS: Record<string, { name: string, category: string, content: string }> = {
  // NÚCLEO
  identidade: {
    name: "Identidade do Agente",
    category: "Núcleo",
    content: DEFAULT_MODULES_V3.identidade || "NOME: Júlia\nPERSONA: Atendente comercial da Mind SMM Panel."
  },
  objetivo: {
    name: "Objetivo do Agente",
    category: "Núcleo",
    content: "OBJETIVO: Vender serviços de engajamento para redes sociais de forma consultiva e direta."
  },
  comportamento_humano: {
    name: "Comportamento Humano",
    category: "Núcleo",
    content: DEFAULT_MODULES_V3.comportamento_humano || "- Responda de forma natural e empática."
  },
  regras_gerais: {
    name: "Regras Gerais",
    category: "Núcleo",
    content: DEFAULT_MODULES_V3.regras_gerais || "- Nunca invente preços.\n- Mantenha o foco em fechar a venda."
  },
  terminologia: {
    name: "Terminologia Específica",
    category: "Núcleo",
    content: "RECONHECIMENTO DE TERMINOLOGIA:\n- 'plays' = Spotify\n- 'seguidores' = Instagram/TikTok\n- 'inscritos' = YouTube"
  },
  texto_ou_audio: {
    name: "Texto ou Áudio",
    category: "Núcleo",
    content: "INSTRUÇÕES DE MÍDIA:\n- Áudio: Transcreva e responda em texto resumido.\n- Imagem/Figurinha: Avise que não pode ver no momento e peça descrição."
  },
  
  // COMERCIAL
  fluxo_vendas: {
    name: "Fluxo de Vendas",
    category: "Comercial",
    content: "FLUXO:\n1. Saudação e identificação da rede.\n2. Apresentação de pacotes e preços.\n3. Quebra de objeções (se houver).\n4. Fechamento com link do painel."
  },
  psicologia_vendas: {
    name: "Psicologia de Vendas",
    category: "Comercial",
    content: DEFAULT_MODULES_V3.psicologia_vendas || "- Use gatilhos de urgência.\n- Destaque segurança."
  },
  qualificacao_lead: {
    name: "Qualificação de Lead",
    category: "Comercial",
    content: "QUALIFICAÇÃO:\n- Identifique se o cliente já tem conta no painel.\n- Entenda se ele busca quantidade ou qualidade (reposição)."
  },
  objecoes_vendas: {
    name: "Objeções de Vendas",
    category: "Comercial",
    content: "- 'É seguro?': Sim, não precisa de senha.\n- 'Cai?': Temos serviços com reposição garantida."
  },
  fechamento_vendas: {
    name: "Fechamento de Vendas",
    category: "Comercial",
    content: DEFAULT_MODULES_V3.fechamento_vendas || "- Solicite o link e direcione para o Pix."
  },
  recuperacao_leads: {
    name: "Recuperação de Leads",
    category: "Comercial",
    content: "RECUPERAÇÃO:\n- 'Oi, conseguiu ver os preços? Ficou alguma dúvida?'"
  },
  
  // REDES SOCIAIS
  spotify: {
    name: "Serviços Spotify",
    category: "Redes Sociais",
    content: DEFAULT_MODULES_V3.spotify || "SERVIÇOS SPOTIFY: Preços e regras de plays/ouvintes."
  },
  instagram: {
    name: "Serviços Instagram",
    category: "Redes Sociais",
    content: DEFAULT_MODULES_V3.instagram || "SERVIÇOS INSTAGRAM: Preços e regras de seguidores/curtidas."
  },
  youtube: {
    name: "Serviços YouTube",
    category: "Redes Sociais",
    content: DEFAULT_MODULES_V3.youtube || "SERVIÇOS YOUTUBE: Preços e regras de inscritos/views."
  },
  tiktok: {
    name: "Serviços TikTok",
    category: "Redes Sociais",
    content: "SERVIÇOS TIKTOK:\n- 1000 Seguidores: R$ 10,00\n- 1000 Views: R$ 1,50"
  },
  
  // SUPORTE
  suporte_pos_compra: {
    name: "Suporte Pós-Compra",
    category: "Suporte",
    content: "REGRAS DE SUPORTE PÓS-COMPRA:\n- Se o cliente mencionar: pedido, número do pedido, queda, reposição, atraso, serviço não iniciado, saldo, recarga, pagamento já realizado ou problemas técnicos;\n- NÃO tente resolver no WhatsApp;\n- Oriente a abrir um TICKET no painel: mindsmmpanel.com"
  }
};

async function migrateKnowledge() {
  console.log("Iniciando migração de conhecimento para o CMS...");

  for (const [key, def] of Object.entries(MODULE_DEFINITIONS)) {
    const { error } = await supabaseAdmin
      .from("agent_modules_v3")
      .upsert({
        workspace_id: WORKSPACE_ID,
        user_id: USER_ID,
        key: key,
        name: def.name,
        category: def.category,
        content: def.content,
        enabled: true,
        priority: 50,
        version: 1,
        updated_at: new Date().toISOString()
      }, { onConflict: "workspace_id,key" });

    if (error) {
      console.error(`Erro ao migrar módulo ${key}:`, error);
    } else {
      console.log(`Módulo ${key} migrado com sucesso.`);
    }
  }

  console.log("Migração concluída.");
}

migrateKnowledge();
