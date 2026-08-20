import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  loader: () => {
    throw redirect({ to: '/dashboard' });
  },
  component: () => (
    <div className="p-4 font-mono text-sm whitespace-pre-wrap">
      For the code present, I get the error below.

Please think step-by-step in order to resolve it.
{`
build failed with exit status 1: stderr:
node_modules/vite/dist/node/chunks/node.js:33675:19)
    at async buildStartViteEnvironments (file:///dev-server/node_modules/@tanstack/start-plugin-core/dist/esm/vite/planning.js:95:23)
    at async Object.buildApp (file:///dev-server/node_modules/@tanstack/start-plugin-core/dist/esm/vite/plugin.js:111:8)
    at async Object.buildApp (file:///dev-server/node_modules/vite/dist/node/chunks/node.js:33667:6)
    at async CAC.<anonymous> (file:///dev-server/node_modules/vite/dist/node/cli.js:777:3) {
  errors: [Getter/Setter]
}
error: script "build:dev" exited with code 1

stdout:
66.05 kB │ gzip:  13.46 kB
dist/client/assets/agente-CwQoA6ti.js                                  87.41 kB │ gzip:  24.05 kB
dist/client/assets/lead-finder-C2IdGIq0.js                             92.38 kB │ gzip:  19.19 kB
dist/client/assets/disparos-kUcHkQXF.js                               306.39 kB │ gzip:  84.01 kB
dist/client/assets/index-DTAqngNN.js                                  769.51 kB │ gzip: 224.45 kB

✓ built in 4.09s
vite v8.0.16 building ssr environment for development...
transforming...✓ 269 modules transformed.
rendering chunks...

If these errors do not contain enough detail to identify the fix, run lovable build diagnostics br_e705d46c-adfa-4e39-8d41-de611d9e06b5 --json with code--exec.
`}
    </div>
  )
});
