$ErrorActionPreference = "Stop"
Set-Location "C:\mind-agent-v3-stage-b"

& {
  $branch = (git branch --show-current).Trim()
  if ($branch -ne "fix/zero-lost-turn-stage-b") { Write-Error "Branch incorreta: $branch"; return }

  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) { Write-Error "existem alteracoes staged locais; corte bloqueado"; return }

  # O runner anterior podia deixar somente o webhook cortado quando o build falhava.
  # Esse estado e conhecido e recuperavel: restaura apenas o webhook tracked antes do pull.
  $tracked = @(git diff --name-only)
  $allowedRecovery = @("src/routes/api/public/hooks/uazapi-webhook.ts")
  $unexpected = @($tracked | Where-Object { $_ -and ($_ -notin $allowedRecovery) })
  if ($unexpected.Count -gt 0) {
    Write-Error ("existem alteracoes tracked locais fora do corte conhecido: " + ($unexpected -join ", "))
    return
  }
  if ($tracked -contains "src/routes/api/public/hooks/uazapi-webhook.ts") {
    Write-Host "Restaurando webhook do corte local que falhou no build anterior..."
    git restore -- "src/routes/api/public/hooks/uazapi-webhook.ts"
    if ($LASTEXITCODE -ne 0) { Write-Error "nao foi possivel restaurar webhook"; return }
  }

  git pull --ff-only
  if ($LASTEXITCODE -ne 0) { Write-Error "git pull falhou"; return }

  # Regenera o runtime a partir do webhook canonical. Isso corrige o antigo draft
  # que carregava o catch externo sem o try correspondente.
  if (Test-Path "src\lib\agent-v3\runtime.server.ts") {
    Remove-Item "src\lib\agent-v3\runtime.server.ts" -Force
  }
  node ".\scripts\stage-b-build-runtime-draft.mjs"
  if ($LASTEXITCODE -ne 0) { Write-Error "regeneracao do runtime falhou"; return }

  node ".\scripts\stage-b-wire-shared-runtime.mjs"
  if ($LASTEXITCODE -ne 0) { Write-Error "transformacao do webhook falhou"; return }

  npm.cmd run build
  if ($LASTEXITCODE -ne 0) {
    git restore -- "src/routeTree.gen.ts" 2>$null
    Write-Error "build falhou; nada sera commitado"
    return
  }

  git restore -- "src/routeTree.gen.ts" 2>$null
  git diff --check
  if ($LASTEXITCODE -ne 0) { Write-Error "git diff --check falhou"; return }

  Write-Host ""
  Write-Host "=== STAGE B SHARED RUNTIME ==="
  git diff --stat -- "src/lib/agent-v3/runtime.server.ts" "src/routes/api/public/hooks/uazapi-webhook.ts"
  git status --short

  git add -- "src/lib/agent-v3/runtime.server.ts" "src/routes/api/public/hooks/uazapi-webhook.ts"
  git commit -m "refactor(stage-b): wire webhook to shared agent runtime"
  if ($LASTEXITCODE -ne 0) { Write-Error "commit falhou"; return }

  git push origin fix/zero-lost-turn-stage-b
  if ($LASTEXITCODE -ne 0) { Write-Error "push falhou"; return }

  Write-Host ""
  Write-Host "STAGE_B_SHARED_RUNTIME_OK"
}
