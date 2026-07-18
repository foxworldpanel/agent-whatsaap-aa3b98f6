/**
 * Agent Mind V2 — Lista de números autorizados a executar a IA.
 *
 * Enquanto a V2 é o cérebro oficial e único do projeto, apenas os números
 * listados abaixo têm permissão para acionar Claude / Model Router /
 * Guard Engine / Analytics. Qualquer outro número é ignorado pelo webhook
 * antes de qualquer chamada de IA — zero custo, zero prompt, zero tool.
 *
 * A V1 permanece apenas arquivada como contingência técnica e nunca é
 * executada.
 */

// +55 11 97011-6430 → somente dígitos.
export const AUTHORIZED_V2_PHONES: readonly string[] = [
  "5511970116430",
];

export function isAuthorizedV2Phone(phone: string | null | undefined): boolean {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return false;
  return AUTHORIZED_V2_PHONES.some((p) => p === digits);
}