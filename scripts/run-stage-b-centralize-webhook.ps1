# Stage B webhook centralization runner
# Generated for the feature branch only. Run from repository root.
$ErrorActionPreference = "Stop"
$repo = (Get-Location).Path
$script = Join-Path $repo "scripts\stage-b-centralize-webhook.mjs"
$webhook = Join-Path $repo "src\routes\api\public\hooks\uazapi-webhook.ts"
if (-not (Test-Path $script)) { throw "Patch script not found: $script" }
if (-not (Test-Path $webhook)) { throw "Webhook not found: $webhook" }
$branch = (git branch --show-current).Trim()
if ($branch -ne "fix/zero-lost-turn-stage-b") { throw "Wrong branch: $branch" }
$before = (git hash-object $webhook).Trim()
if ($before -ne "235bc4cb107b25cb28d77555e7e8373bee2937c5") { throw "Webhook baseline changed: $before" }
node $script
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Build failed; not committing" }
git checkout -- src/routeTree.gen.ts 2>$null
if ($LASTEXITCODE -ne 0) { $global:LASTEXITCODE = 0 }
git add -- "src/routes/api/public/hooks/uazapi-webhook.ts"
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "git diff --check failed" }
git commit -m "refactor(stage-b): wire webhook to durable ownership boundary"
if ($LASTEXITCODE -ne 0) { throw "Commit failed" }
git push origin "fix/zero-lost-turn-stage-b"
if ($LASTEXITCODE -ne 0) { throw "Push failed" }
Write-Host "Stage B webhook centralization committed and pushed successfully."
