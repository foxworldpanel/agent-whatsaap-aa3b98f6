$ErrorActionPreference = "Stop"
Set-Location "C:\mind-agent-v3-stage-b"

& {
  $branch = (git branch --show-current).Trim()
  if ($branch -ne "fix/zero-lost-turn-stage-b") {
    Write-Error "Branch incorreta: $branch"
    return
  }

  git pull --ff-only
  if ($LASTEXITCODE -ne 0) { Write-Error "git pull falhou"; return }

  node .\scripts\stage-b-extract-runtime.mjs
  if ($LASTEXITCODE -ne 0) { Write-Error "auditoria do runtime falhou"; return }

  if (-not (Test-Path ".stage-b-runtime-extraction.json")) {
    Write-Error "relatorio de auditoria nao foi gerado"
    return
  }

  $report = Get-Content ".stage-b-runtime-extraction.json" -Raw | ConvertFrom-Json
  Write-Host ""
  Write-Host "=== STAGE B RUNTIME AUDIT ==="
  Write-Host "Webhook chars: $($report.webhookChars)"
  Write-Host "Runtime body chars: $($report.runtimeBodyChars)"
  Write-Host "HTTP terminal returns: $($report.responseReturnCount)"
  Write-Host "Unmapped returns: $($report.unmappedResponses.Count)"
  Write-Host ""
  Write-Host "Closure hits:"
  $report.closureHits.PSObject.Properties | ForEach-Object {
    Write-Host ("  {0}: {1}" -f $_.Name, $_.Value)
  }

  if ($report.unmappedResponses.Count -ne 0) {
    Write-Error "existem retornos HTTP nao mapeados; corte bloqueado"
    return
  }

  Write-Host ""
  Write-Host "AUDIT_OK"
}
