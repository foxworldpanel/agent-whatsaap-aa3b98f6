import { runAgentV2ConversationTest } from './homologation';

export async function runFullHomologationSuite() {
  console.log('🚀 Iniciando Suite de Homologação Spotify V2\n');

  const fixtures = {
    'spotify_playlist': { 
      serviceName: 'Aluguel de Playlist', 
      salePrice: 49.90, 
      isActive: true, 
      linkType: 'track' 
    },
    'spotify_followers': { 
      serviceName: 'Seguidores para Perfil', 
      salePrice: 15.00, 
      isActive: true, 
      linkType: 'artist_profile',
      minimum: 50
    },
    'spotify_plays': { 
      isActive: false 
    }
  };

  const conversations = [
    {
      name: 'CONVERSA 1 — DESCOBERTA E COMPRA',
      messages: [
        'Quero divulgar minha música.',
        'Spotify.',
        'Quero playlist.',
        'Quanto custa?',
        'Vamos fechar.',
        'Não tenho cadastro.'
      ]
    },
    {
      name: 'CONVERSA 2 — SEGUIDORES',
      messages: [
        'Quero seguidores no Spotify.',
        'Esses seguidores vão ouvir minhas músicas?',
        'Quero 500.'
      ]
    },
    {
      name: 'CONVERSA 3 — SERVIÇO INDISPONÍVEL',
      messages: [
        'Quero plays no Spotify.',
        'Sim.',
        'Mostra a playlist.'
      ]
    },
    {
      name: 'CONVERSA 4 — PREÇO ANTIGO NO HISTÓRICO',
      messages: [
        'Quanto custa a playlist?'
      ],
      initialState: {
        network: 'spotify' as any,
        service: 'playlist'
      },
      history: [
        { sender: 'agente', body: 'A playlist custa R$ 97.' }
      ]
    },
    {
      name: 'CONVERSA 6 — SUPORTE',
      messages: [
        'Meu pedido de Spotify caiu.'
      ],
      initialState: {
        network: 'spotify' as any,
        service: 'playlist'
      }
    },
    {
      name: 'CONVERSA 7 — ENCERRAMENTO',
      messages: [
        'Obrigado.'
      ]
    }
  ];

  for (const conv of conversations) {
    console.log(`\n--- Executando: ${conv.name} ---`);
    const result = await runAgentV2ConversationTest({
      conversationName: conv.name,
      messages: conv.messages,
      fixtures,
      initialState: conv.initialState as any
    });

    result.turns.forEach((turn, i) => {
      console.log(`Turno ${i + 1}: ${turn.message}`);
      console.log(`Resposta: ${turn.claudeResponse}`);
      console.log(`Estado: ${turn.stateAfter.network}/${turn.stateAfter.service} (Intent: ${turn.stateAfter.intent})`);
      console.log(`Módulos: ${turn.loadedModules.join(', ')}`);
      console.log(`Tokens: ${turn.metrics.inputTokens} | Score: ${turn.score}`);
      console.log('---');
    });

    console.log(`Resultado Final: ${result.finalScore.toFixed(1)}% - ${result.status.toUpperCase()}`);
  }
}
