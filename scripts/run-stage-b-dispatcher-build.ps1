$ErrorActionPreference = "Stop"
Set-Location "C:\mind-agent-v3-stage-b"

& {
  if ((git branch --show-current).Trim() -ne "fix/zero-lost-turn-stage-b") { Write-Error "branch incorreta"; return }
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) { Write-Error "existem alteracoes staged locais"; return }

  $tracked = @(git diff --name-only)
  if ($tracked.Count -gt 0) { Write-Error ("existem alteracoes tracked locais: " + ($tracked -join ", ")); return }

  git pull --ff-only
  if ($LASTEXITCODE -ne 0) { Write-Error "pull falhou"; return }

  node ".\scripts\stage-b-fix-runtime-input.mjs"
  if ($LASTEXITCODE -ne 0) { Write-Error "runtime input patch falhou"; return }

  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { Write-Error "build falhou; nada sera commitado"; return }

  git diff --check
  if ($LASTEXITCODE -ne 0) { Write-Error "diff check falhou"; return }

  $routeTree = Get-Content "src\routeTree.gen.ts" -Raw
  if (-not $routeTree.Contains("agent-inbound-dispatcher") -or -not $routeTree.Contains("agent-inbound-recovery")) {
    Write-Error "routeTree nao registrou dispatcher/recovery"; return
  }

  Write-Host ""
  Write-Host "=== STAGE B DISPATCHER BUILD ==="
  git status --short
  git diff --stat -- "src/routes/api/public/hooks/uazapi-webhook.ts" "src/routeTree.gen.ts"

  git add -- "src/routes/api/public/hooks/uazapi-webhook.ts" "src/routeTree.gen.ts"
  git commit -m "fix(stage-b): validate dispatcher routes and runtime input"
  if ($LASTEXITCODE -ne 0) { Write-Error "commit falhou"; return }
  git push origin fix/zero-lost-turn-stage-b
  if ($LASTEXITCODE -ne 0) { Write-Error "push falhou"; return }

  Write-Host "STAGE_B_DISPATCHER_BUILD_OK"
}
