import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  loader: () => {
    throw redirect({ to: '/dashboard' });
  },
  component: () => (
    <div className="p-8">
      <h1 className="text-xl font-bold mb-4">Manifesto Técnico</h1>
      <pre className="whitespace-pre-wrap bg-slate-100 p-4 rounded text-sm">
{`Parte 1 — VPS (arquivo server.js atualizado)

Como fizemos antes, vou te passar comando por comando na VPS. Antes de mais nada:

Comando 1 — parar o worker atual:

pkill -f "node server.js"

Roda isso e me avisa quando terminar, que eu te passo o próximo passo pra atualizar o arquivo.

Parte 2 — 3 arquivos pro Lovable (manda depois de resolver a VPS)

Mensagem 1 — src/lib/instagram-session/instagram-session.functions.ts

Troca:

typescript

export const validateInstagramAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ credentialId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { InstagramSessionManager } = await import("./instagram-session-manager.server");
    return await InstagramSessionManager.validate(data.credentialId);
  });

por:

typescript

export const validateInstagramAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ credentialId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { InstagramSessionManager } = await import("./instagram-session-manager.server");
    return await InstagramSessionManager.validate(data.credentialId);
  });

// Consulta o status em tempo real durante uma conexão em andamento (o
// login pode levar até 20 minutos, feito manualmente pelo usuário via
// VNC). Diferente de validateInstagramAction, que só confirma sessão
// já salva em disco — esta consulta o estado em memória do worker,
// incluindo o username assim que o login é detectado.
export const getInstagramStatusAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ credentialId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { InstagramSessionManager } = await import("./instagram-session-manager.server");
    return await InstagramSessionManager.getStatus(data.credentialId);
  });`}
      </pre>
    </div>
  )
});
