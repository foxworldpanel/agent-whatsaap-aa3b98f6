import { runAgentV2Turn } from './orchestrator';
import { createInitialConversationStateV2 } from './conversation-state';

/**
 * Test suite to ensure catalog data correctly overrides any other potential source of info.
 */
export async function runCatalogConflictTests() {
  console.log('🧪 Iniciando Testes de Conflito de Catálogo V2\n');

  const workspaceId = 'bd59fa41-d5d2-4f36-96a8-a3411784962d';
  const conversationId = '00000000-0000-4000-a000-000000000000';
  const phoneNumber = '5511999999999';

  const baseInput = {
    workspaceId,
    conversationId,
    phoneNumber,
    executionMode: 'isolated' as const,
    mode: 'receptive' as const,
    shortHistory: [],
  };

  const tests = [
    {
      name: '1. Serviço Ativo no Catálogo vs Suposição de Manutenção',
      fn: async () => {
        // Simula um cenário onde o agente poderia achar que está em manutenção (via histórico ou similar)
        // mas o catálogo diz que está ATIVO.
        const state = createInitialConversationStateV2({ conversationId, workspaceId, phoneNumber });
        state.network = 'spotify' as any;
        state.service = 'playlist';
        
        const res = await runAgentV2Turn({
          ...baseInput,
          currentMessage: 'Ainda está funcionando a playlist?',
          previousState: state,
          toolFixtures: {
            catalog: [
              { service: 2269, name: 'Spotify - Playlist', rate: 15.00, min: 100, status: 'active' }
            ]
          }
        });

        // A "Regra de Ouro" no prompt builder deve garantir que o agente não diga "está em manutenção"
        const response = res.finalResponse.toLowerCase();
        const mentionsActive = response.includes('sim') || response.includes('disponível') || response.includes('funciona');
        const mentionsMaintenance = response.includes('manutenção') || response.includes('instável') || response.includes('desativado');
        
        return mentionsActive && !mentionsMaintenance;
      }
    },
    {
      name: '2. Preço exato do Catálogo',
      fn: async () => {
        const state = createInitialConversationStateV2({ conversationId, workspaceId, phoneNumber });
        state.network = 'spotify' as any;
        state.service = 'playlist';

        const res = await runAgentV2Turn({
          ...baseInput,
          currentMessage: 'Qual o valor de 1000 plays?',
          previousState: state,
          toolFixtures: {
            catalog: [
              { service: 2269, name: 'Spotify - Playlist', rate: 12.34, min: 100, status: 'active' }
            ]
          }
        });

        // O preço deve ser exatamente R$ 12,34 (ou mencionar 12,34)
        const response = res.finalResponse;
        const matches = response.includes('12,34') || response.includes('12.34');
        if (!matches) console.log('DEBUG Test 2 response:', response);
        return matches;
      }
    },
    {
      name: '3. Serviço Inativo no Catálogo',
      fn: async () => {
        const state = createInitialConversationStateV2({ conversationId, workspaceId, phoneNumber });
        state.network = 'spotify' as any;
        state.service = 'playlist';

        const res = await runAgentV2Turn({
          ...baseInput,
          currentMessage: 'Quero comprar plays agora.',
          previousState: state,
          toolFixtures: {
            catalog: [] // Catálogo vazio = indisponível
          }
        });

        const response = res.finalResponse.toLowerCase();
        return response.includes('indisponível') || response.includes('no momento') || response.includes('manutenção');
      }
    }
  ];

  let passed = 0;
  for (const t of tests) {
    try {
      console.log(`Running: ${t.name}...`);
      if (await t.fn()) {
        console.log(`✅ PASSED: ${t.name}`);
        passed++;
      } else {
        console.error(`❌ FAILED: ${t.name}`);
      }
    } catch (e) {
      console.error(`❌ ERROR in ${t.name}:`, e);
    }
  }

  console.log(`\n📊 Resultado Conflito Catálogo: ${passed}/${tests.length} testes passaram.\n`);
  return passed === tests.length;
}
