# 在仓库根目录执行: .\scripts\push-github.ps1
# 作用: 应用常见可缓解推送失败的 Git 配置，并执行 git push origin main
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

Write-Host "[git] http.version=HTTP/1.1, postBuffer=524288000 (本仓库 local)" -ForegroundColor DarkGray
git config http.version HTTP/1.1
git config http.postBuffer 524288000

Write-Host "[git] pushing origin main ..." -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "推送仍失败时请看仓库根目录 GIT_PUSH.txt（网络/代理/SSH）。" -ForegroundColor Yellow
  exit $LASTEXITCODE
}
Write-Host "完成。" -ForegroundColor Green
