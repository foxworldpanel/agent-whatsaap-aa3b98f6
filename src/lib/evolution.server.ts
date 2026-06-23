// Server-only helpers for Evolution API (WhatsApp).
// Never import this file from client / route components directly.

export type EvolutionCreds = {
  evolution_url: string;
  evolution_api_key: string;
  evolution_instance: string;
};

function normalizePhone(raw: string): string {
  // Keep digits only; Evolution expects E.164 without "+"
  return raw.replace(/\D+/g, "");
}

export async function evolutionSendText(
  creds: EvolutionCreds,
  to: string,
  text: string,
): Promise<void> {
  const base = creds.evolution_url.replace(/\/+$/, "");
  const url = `${base}/message/sendText/${encodeURIComponent(creds.evolution_instance)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: creds.evolution_api_key,
    },
    body: JSON.stringify({ number: normalizePhone(to), text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Evolution sendText falhou (${res.status}): ${body.slice(0, 300)}`);
  }
}

export async function evolutionSendAudio(
  creds: EvolutionCreds,
  to: string,
  audioBase64OrUrl: string,
): Promise<void> {
  const base = creds.evolution_url.replace(/\/+$/, "");
  const url = `${base}/message/sendWhatsAppAudio/${encodeURIComponent(creds.evolution_instance)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: creds.evolution_api_key,
    },
    body: JSON.stringify({ number: normalizePhone(to), audio: audioBase64OrUrl }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Evolution sendAudio falhou (${res.status}): ${body.slice(0, 300)}`);
  }
}