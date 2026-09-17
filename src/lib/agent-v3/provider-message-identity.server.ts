import { randomUUID } from "node:crypto";

/** Provider ids remain canonical when present. A missing provider id cannot be
 * deduplicated safely from payload/time buckets, because two legitimate equal
 * messages may arrive together. Give every providerless delivery a fresh id;
 * durable message/job identity then owns retries after persistence. */
export function buildProviderFallbackMessageId(phone:string):string{
 const normalized=String(phone||"").replace(/\D+/g,"")||"unknown";
 return `fb:${normalized}:${randomUUID()}`;
}
