import { runConversationStateTests } from './src/lib/agent-v2/conversation-state.test';

const results = runConversationStateTests();

if (results.failed > 0) {
  console.error('Alguns testes falharam!');
  process.exit(1);
} else {
  console.log('Todos os testes passaram com sucesso!');
  process.exit(0);
}
