import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-bold">Correção V3 — Terminologia de Rede</CardTitle>
            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
              V3 BUGFIX
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm font-mono">
          <div className="bg-muted p-4 rounded-md overflow-x-auto whitespace-pre-wrap text-yellow-400 font-bold mb-4">
            Foi identificado um erro de comportamento:
            Entrada: "quero comprar plays"
            Resposta atual: "Qual rede você quer aumentar plays? YouTube, Spotify, TikTok ou outra?"
            Comportamento incorreto.
          </div>
          <div className="bg-muted p-4 rounded-md overflow-x-auto whitespace-pre-wrap">
            {`Adicionar regra absoluta no Orchestrator V3 ou no módulo global de terminologia:

RECONHECIMENTO DE TERMOS:
- plays = Spotify
- streams = Spotify
- ouvintes = Spotify
- saves = Spotify

Quando qualquer um desses termos aparecer, considerar Spotify confirmado.
Nunca perguntar qual rede.

Visualizações/views:
- YouTube
- Instagram
- TikTok
- Kwai
- Facebook
Essas continuam podendo exigir confirmação da rede.

Criar teste de regressão:
Input: "quero comprar plays"
Esperado: selectedKeys deve conter spotify.
A resposta não pode perguntar "qual rede?".`}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
