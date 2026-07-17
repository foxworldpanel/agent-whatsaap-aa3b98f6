export function normalizeIncomingMessage(payload: any) {
  const msg = payload.data || payload;
  const messageId = msg.id || msg.key?.id;
  const phone = msg.key?.remoteJid?.split('@')[0] || msg.from?.split('@')[0];
  
  let type = 'unsupported';
  let text = '';
  let mediaId = '';
  let mediaUrl = '';
  let mimeType = '';

  if (msg.message?.conversation) {
    type = 'text';
    text = msg.message.conversation;
  } else if (msg.message?.extendedTextMessage?.text) {
    type = 'text';
    text = msg.message.extendedTextMessage.text;
  } else if (msg.message?.audioMessage) {
    type = 'audio';
    mediaId = msg.message.audioMessage.url || '';
    mediaUrl = msg.message.audioMessage.url || '';
    mimeType = msg.message.audioMessage.mimetype || '';
  }

  return {
    messageId,
    phone,
    type,
    text: typeof text === 'string' ? text : '',
    mediaId,
    mediaUrl,
    mimeType,
    timestamp: Date.now()
  };
}
