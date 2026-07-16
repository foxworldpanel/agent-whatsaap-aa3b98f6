export function routeIntent(message: string): string {
  const msg = message.toLowerCase();
  
  if (/^(oi|olá|bom dia|boa tarde|boa noite|opa|eae)/i.test(msg)) return 'greeting';
  if (/(trabalham|fazem|oferecem|serviço|vende)/i.test(msg)) return 'general_question';
  if (/(spotify|instagram|youtube|tiktok|facebook|kwai)/i.test(msg)) return 'network_detection';
  if (/(caiu|erro|problema|ajuda|suporte|não funciona)/i.test(msg)) return 'support_redirect';
  if (/(obrigado|vlw|valeu|show|entendi|beleza|blz)/i.test(msg)) return 'close';
  
  return 'unknown';
}

export function detectNetwork(message: string): string | null {
  const msg = message.toLowerCase();
  if (msg.includes('spotify')) return 'spotify';
  if (msg.includes('instagram')) return 'instagram';
  if (msg.includes('youtube')) return 'youtube';
  if (msg.includes('tiktok')) return 'tiktok';
  if (msg.includes('facebook')) return 'facebook';
  if (msg.includes('kwai')) return 'kwai';
  return null;
}
