$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::UTF8
$LogPath = 'D:\Ai\脚本\拆图\无限ai画布---节点连线模式\jimeng-wsl-setup.log'
Start-Transcript -Path $LogPath -Append

function Test-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Run-Native {
  param(
    [string]$Label,
    [string]$Exe,
    [string[]]$Args,
    [int[]]$OkExitCodes = @(0, 3010)
  )
  Write-Host "`n==> $Label" -ForegroundColor Cyan
  Write-Host "$Exe $($Args -join ' ')" -ForegroundColor DarkGray
  & $Exe @Args
  $code = $LASTEXITCODE
  Write-Host "<== exit code: $code" -ForegroundColor DarkGray
  if ($OkExitCodes -notcontains $code) {
    throw "$Label failed with exit code $code"
  }
  return $code
}

if (-not (Test-Admin)) {
  Write-Host 'This script must run as Administrator.' -ForegroundColor Red
  Stop-Transcript
  Read-Host 'Press Enter to exit'
  exit 1
}

try {
  Run-Native 'Enable Windows Subsystem for Linux' 'dism.exe' @('/online', '/enable-feature', '/featurename:Microsoft-Windows-Subsystem-Linux', '/all', '/norestart') | Out-Null
  Run-Native 'Enable Virtual Machine Platform' 'dism.exe' @('/online', '/enable-feature', '/featurename:VirtualMachinePlatform', '/all', '/norestart') | Out-Null

  Write-Host "`n==> Stop WSL" -ForegroundColor Cyan
  wsl.exe --shutdown 2>$null

  Run-Native 'Update WSL from web download' 'wsl.exe' @('--update', '--web-download') @(0) | Out-Null
  Run-Native 'Install Ubuntu distro' 'wsl.exe' @('--install', '-d', 'Ubuntu', '--web-download') @(0, 3010) | Out-Null

  Write-Host "`n==> WSL distro list" -ForegroundColor Cyan
  wsl.exe -l -v

  Write-Host "`n==> Install dreamina CLI as WSL root" -ForegroundColor Cyan
  $dreaminaInstall = 'set -e; if ! command -v curl >/dev/null 2>&1; then apt-get update && apt-get install -y curl ca-certificates; fi; curl -fsSL https://jimeng.jianying.com/cli | bash; /root/.local/bin/dreamina --version'
  wsl.exe -d Ubuntu -u root -- bash -lc $dreaminaInstall
  Write-Host "dreamina install exit: $LASTEXITCODE"

  Write-Host "`n==> Final dreamina check" -ForegroundColor Cyan
  wsl.exe -d Ubuntu -u root -- bash -lc '/root/.local/bin/dreamina --version && /root/.local/bin/dreamina user_credit || true'

  Write-Host "`nSetup finished. If Windows asked for a reboot, reboot first, then rerun this script." -ForegroundColor Green
} catch {
  Write-Host "`nFAILED: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'If DISM or WSL reported reboot required, reboot Windows and rerun this script.' -ForegroundColor Yellow
}

Stop-Transcript
Read-Host 'Press Enter to close'
