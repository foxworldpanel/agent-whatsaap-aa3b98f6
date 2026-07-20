import { runAgentV3Turn } from "./lib/agent-v3/orchestrator.server";
import { getConversationStateV3, saveConversationStateV3 } from "./lib/agent-v3/conversation-state.server";

// Simulações de payloads Uazapi para teste de infraestrutura do webhook
const AUTHORIZED_PHONE = "5511970116430";
const USER_ID = "f8da521a-e8db-4efe-8c9b-9bd69749c0a7";

async function simulateWebhookCall(label: string, payload: any) {
  console.log(`\n--- TEST: ${label} ---`);
  const response = await fetch("http://localhost:8080/api/public/hooks/uazapi-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  
  const text = await response.text();
  console.log(`Status: ${response.status} | Body: ${text}`);
  return { status: response.status, body: text };
}

async function runTests() {
  // Teste 1: Texto simples
  await simulateWebhookCall("Texto Simples (Bom dia)", {
    message: {
      chatid: `${AUTHORIZED_PHONE}@c.us`,
      sender: `${AUTHORIZED_PHONE}@c.us`,
      id: "MSG_TEXT_001",
      text: "Bom dia",
      type: "chat"
    }
  });

  // Teste 2: Duplicata de MessageID
  await simulateWebhookCall("Duplicata MessageID (Mesmo ID)", {
    message: {
      chatid: `${AUTHORIZED_PHONE}@c.us`,
      id: "MSG_TEXT_001", // Repetido
      text: "Bom dia de novo",
      type: "chat"
    }
  });

  // Teste 3: FromMe
  await simulateWebhookCall("fromMe (Ignorar)", {
    message: {
      chatid: `${AUTHORIZED_PHONE}@c.us`,
      id: "MSG_FROMME_001",
      text: "Resposta do bot",
      fromMe: true
    }
  });

  // Teste 4: Áudio (Mock de Transcrição - requer mediaUrl válido ou mock no processAudioV3)
  // Como não temos um áudio real agora, vamos testar apenas se o fluxo de detecção ativa
  await simulateWebhookCall("Detecção de Áudio", {
    message: {
      chatid: `${AUTHORIZED_PHONE}@c.us`,
      id: "MSG_AUDIO_001",
      mediaUrl: "https://example.com/audio.ogg",
      mimetype: "audio/ogg",
      type: "ptt"
    }
  });

  // Teste 5: Imagem com legenda
  await simulateWebhookCall("Imagem com legenda", {
    message: {
      chatid: `${AUTHORIZED_PHONE}@c.us`,
      id: "MSG_IMAGE_001",
      caption: "Quero plays no Spotify",
      mimetype: "image/jpeg",
      type: "image"
    }
  });

  // Teste 6: Figurinha
  await simulateWebhookCall("Figurinha", {
    message: {
      chatid: `${AUTHORIZED_PHONE}@c.us`,
      id: "MSG_STICKER_001",
      type: "sticker"
    }
  });
}

runTests().catch(console.error);
