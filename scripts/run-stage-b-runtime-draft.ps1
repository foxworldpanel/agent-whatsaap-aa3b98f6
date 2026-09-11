$ErrorActionPreference = "Stop"
Set-Location "C:\mind-agent-v3-stage-b"

& {
  if ((git branch --show-current).Trim() -ne "fix/zero-lost-turn-stage-b") { Write-Error "branch incorreta"; return }
  git pull --ff-only
  if ($LASTEXITCODE -ne 0) { Write-Error "pull falhou"; return }

  if (Test-Path "src\lib\agent-v3\runtime.server.ts") {
    Remove-Item "src\lib\agent-v3\runtime.server.ts" -Force
  }
  node ".\scripts\stage-b-build-runtime-draft.mjs"
  if ($LASTEXITCODE -ne 0) { Write-Error "geracao do runtime draft falhou"; return }

  $buildLog = "C:\mind-agent-v3-stage-b\.stage-b-runtime-build.log"
  cmd /c "npm.cmd run build > `"$buildLog`" 2>&1"
  $buildExit = $LASTEXITCODE

  git restore -- "src/routeTree.gen.ts" 2>$null
  Write-Host ""
  Write-Host "=== RUNTIME DRAFT BUILD ==="
  Write-Host "Exit: $buildExit"
  Get-Content $buildLog -Tail 160
  Write-Host ""
  if ($buildExit -eq 0) { Write-Host "RUNTIME_DRAFT_BUILD_OK" } else { Write-Host "RUNTIME_DRAFT_BUILD_NEEDS_DEPS" }
}
