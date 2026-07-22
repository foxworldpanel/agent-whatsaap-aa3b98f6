// SECURITY: Previously this helper expanded access to every user that shared
// the same self-reported `integrations.uazapi_token` value. Because that
// field is user-writable via saveIntegrations, any tenant could type another
// tenant's token and instantly gain read/write access to their conversations,
// contacts, and WhatsApp numbers. Cross-tenant sharing must be modeled with
// an explicit owner-approved membership table before it can be reintroduced.
export async function getSharedUazapiUserIds(context: { userId: string }) {
  return [context.userId];
}