import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  loader: () => {
    throw redirect({ to: '/dashboard' });
  },
  component: () => (
    <div className="p-8">
      <h1 className="text-xl font-bold mb-4">Manifesto Técnico</h1>
      <pre className="whitespace-pre-wrap bg-slate-100 p-4 rounded text-sm">
{`ARQUIVO EXATO A EDITAR: src/lib/instagram-worker/instagram-worker.ts

Troca:

typescript

try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

por:

typescript

try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          // Token de autenticação do worker — sem isso, o servidor na
          // VPS recusa toda requisição com 401 (proteção adicionada em
          // 21/08/2026, junto com a implantação do worker real).
          'x-worker-token': process.env.INSTAGRAM_WORKER_TOKEN || '',
          ...options.headers,
        },
      });


Mensagem 2 — variáveis de ambiente

Preciso que você adicione 2 variáveis de ambiente (Environment Variables / Secrets) nas configurações do projeto:

INSTAGRAM_WORKER_URL = http://169.58.169.242:3000
INSTAGRAM_WORKER_TOKEN = 091087ro`}
      </pre>
    </div>
  )
});
