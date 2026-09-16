import { randomUUID } from "node:crypto";

/** Provider message IDs remain the durable dedupe key when available. Without
 * one, distinct identical deliveries cannot be safely content-deduplicated.
 * Give every delivery a fresh identity instead of collapsing messages by a
 * time/content bucket. This favors no lost turns; providerless retries can be
 * duplicated, so downstream durable turn ownership remains authoritative. */
export function buildFallbackInboundMessageId(phone:string):string{
 const normalized=String(phone||"").replace(/\D+/g,"")||"unknown";
 return `fb:${normalized}:${randomUUID()}`;
}
