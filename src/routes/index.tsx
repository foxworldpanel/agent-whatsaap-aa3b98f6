import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Status do Agente V3</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Runtime Ativo</CardTitle>
            <Badge variant="default">V3 (Haiku 4.5)</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">Operacional</div>
            <p className="text-xs text-muted-foreground mt-1">Isolamento de módulos concluído</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Arquitetura</CardTitle>
            <Badge variant="outline">Early Gate</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-sm">inputKind: Ativo</div>
            <div className="text-sm mt-1">DEFAULT_MODULES_V3: Ativo</div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
