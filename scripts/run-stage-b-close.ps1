$ErrorActionPreference = "Stop"
$repo = "C:\mind-agent-v3-stage-b"
$branch = "fix/zero-lost-turn-stage-b"

& {
  Set-Location $repo
  if ((git branch --show-current).Trim() -ne $branch) { Write-Error "Wrong branch"; return }
  if (git diff --quiet -- . ':!*.bak') { } else { Write-Error "Tracked working tree is not clean"; return }
  if (git diff --cached --quiet) { } else { Write-Error "Staged changes exist"; return }

  git pull --ff-only
  if ($LASTEXITCODE -ne 0) { return }

  node "$repo\scripts\stage-b-mark-operational-attention.mjs"
  if ($LASTEXITCODE -ne 0) { return }

  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; return }

  git diff --check
  if ($LASTEXITCODE -ne 0) { Write-Error "diff --check failed"; return }

  Write-Host "`n=== STAGE B CLOSURE ==="
  git status --short
  git diff --stat -- src/lib/agent-v3/inbound-job-dispatch.server.ts src/routes/api/public/hooks/uazapi-webhook.ts src/routeTree.gen.ts

  git add -- src/lib/agent-v3/inbound-job-dispatch.server.ts src/routes/api/public/hooks/uazapi-webhook.ts src/routeTree.gen.ts
  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) { Write-Host "No closure changes to commit"; return }

  git commit -m "fix(stage-b): quarantine operational runtime outcomes"
  if ($LASTEXITCODE -ne 0) { return }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { return }
  Write-Host "STAGE_B_CLOSURE_OK"
}
