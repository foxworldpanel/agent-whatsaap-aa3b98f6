import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MIND_WORKSPACE_ID = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runAudit() {
  console.log('--- INICIANDO AUDITORIA CMS V3 (MIND SMM) ---');

  // 1. Buscar todos os módulos
  const { data: modules, error } = await supabase
    .from('agent_modules_v3')
    .select('*')
    .eq('workspace_id', MIND_WORKSPACE_ID);

  if (error) {
    console.error('Erro ao buscar módulos:', error);
    return;
  }

  console.log('\n### TABELA DE MÓDULOS REAIS ###');
  console.log('| key | name | enabled | always | platforms | products | stages | intents | triggers | size |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');

  modules?.sort((a,b) => (a.key || '').localeCompare(b.key || '')).forEach(m => {
    const size = (m.content || '').length;
    console.log(`| ${m.key} | ${m.name} | ${m.enabled} | ${m.always_load} | ${JSON.stringify(m.selector_platforms)} | ${JSON.stringify(m.selector_products)} | ${JSON.stringify(m.selector_stages)} | ${JSON.stringify(m.selector_intents)} | ${JSON.stringify(m.selector_triggers)} | ${size} |`);
  });

  // 2. Simulação de Conversa
  const conversation = [
    { msg: "Boa tarde", intent: 'saudacao', platform: null, product: null },
    { msg: "Tenho interesse", intent: 'interesse', platform: null, product: null },
    { msg: "Spotify", intent: 'interesse', platform: 'spotify', product: null },
    { msg: "1000 plays", intent: 'cotacao', platform: 'spotify', product: 'plays' },
    { msg: "Quero pagar no Pix", intent: 'pagamento', platform: 'spotify', product: 'plays' }
  ];

  console.log('\n--- SIMULAÇÃO DE FLUXO ---');
  let historyContext = { platform: null as string | null, product: null as string | null };

  for (const turn of conversation) {
    console.log(`\n> Mensagem: "${turn.msg}"`);
    if (turn.platform) historyContext.platform = turn.platform;
    if (turn.product) historyContext.product = turn.product;

    const loaded = modules?.filter(m => {
      if (!m.enabled) return false;
      if (m.always_load) return true;
      
      const platformMatch = !m.selector_platforms || m.selector_platforms.length === 0 || m.selector_platforms.includes(historyContext.platform);
      const productMatch = !m.selector_products || m.selector_products.length === 0 || m.selector_products.includes(historyContext.product);
      const intentMatch = m.selector_intents?.includes(turn.intent);
      
      // Lógica simplificada: se tem plataforma/produto no seletor, eles DEVEM bater com o contexto se o contexto existir
      // Se não tem nada no seletor, bate por intenção.
      if (m.selector_platforms?.length > 0 || m.selector_products?.length > 0) {
          return platformMatch && productMatch && (intentMatch || m.selector_intents?.length === 0);
      }
      
      return intentMatch;
    });

    console.log(`Módulos ativos: ${loaded?.map(l => l.name).join(', ')}`);
    const totalChars = loaded?.reduce((acc, l) => acc + (l.content?.length || 0), 0) || 0;
    console.log(`Total: ${totalChars} chars (~${Math.ceil(totalChars/4)} tokens)`);
  }
}

runAudit();
