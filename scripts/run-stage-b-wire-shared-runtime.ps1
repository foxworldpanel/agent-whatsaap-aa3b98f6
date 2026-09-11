$ErrorActionPreference = "Stop"
Set-Location "C:\mind-agent-v3-stage-b"

& {
  $branch = (git branch --show-current).Trim()
  if ($branch -ne "fix/zero-lost-turn-stage-b") { Write-Error "Branch incorreta: $branch"; return }

  if (-not (git diff --quiet)) { Write-Error "existem alteracoes tracked locais; corte bloqueado"; return }
  if (-not (git diff --cached --quiet)) { Write-Error "existem alteracoes staged locais; corte bloqueado"; return }

  git pull --ff-only
  if ($LASTEXITCODE -ne 0) { Write-Error "git pull falhou"; return }

  node ".\scripts\stage-b-wire-shared-runtime.mjs"
  if ($LASTEXITCODE -ne 0) { Write-Error "transformacao do webhook falhou"; return }

  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { Write-Error "build falhou; nao sera commitado"; return }

  git diff --check
  if ($LASTEXITCODE -ne 0) { Write-Error "git diff --check falhou"; return }

  Write-Host ""
  Write-Host "=== STAGE B SHARED RUNTIME ==="
  git diff --stat -- "src/routes/api/public/hooks/uazapi-webhook.ts"
  git status --short

  git add -- "src/routes/api/public/hooks/uazapi-webhook.ts"
  git commit -m "refactor(stage-b): wire webhook to shared agent runtime"
  if ($LASTEXITCODE -ne 0) { Write-Error "commit falhou"; return }

  git push origin fix/zero-lost-turn-stage-b
  if ($LASTEXITCODE -ne 0) { Write-Error "push falhou"; return }

  Write-Host ""
  Write-Host "STAGE_B_SHARED_RUNTIME_OK"
}
