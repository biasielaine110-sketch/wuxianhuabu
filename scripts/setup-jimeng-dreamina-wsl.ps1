# 一键安装 WSL + Ubuntu + dreamina CLI（即梦）
# 可由 jimeng-server 调用；无管理员时会自动弹出 UAC 提权窗口
param(
    [switch]$Elevated,
    [string]$StatusFile = ""
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::UTF8
$OutputEncoding = [System.Text.UTF8Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
if (-not $StatusFile) {
    $StatusFile = Join-Path $RepoRoot "server\.jimeng-wsl-setup-status.json"
}
$LogPath = Join-Path $RepoRoot "server\.jimeng-wsl-setup.log"

$global:SetupSteps = New-Object System.Collections.Generic.List[string]
$global:NeedReboot = $false

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Add-Step {
    param([string]$Text)
    $global:SetupSteps.Add($Text) | Out-Null
    Write-Host $Text
}

function Write-SetupStatus {
    param(
        [string]$Phase,
        [string]$Status,
        [string]$Message = "",
        [bool]$Ok = $null,
        [bool]$NeedAdmin = $false,
        [string[]]$ManualGuide = @()
    )
    $payload = [ordered]@{
        phase       = $Phase
        status      = $Status
        message     = $Message
        steps       = @($global:SetupSteps)
        needReboot  = $global:NeedReboot
        needAdmin   = $NeedAdmin
        ok          = $Ok
        manualGuide = $ManualGuide
        updatedAt   = (Get-Date).ToString("o")
    }
    $json = $payload | ConvertTo-Json -Depth 6 -Compress
    $dir = Split-Path -Parent $StatusFile
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($StatusFile, $json, [System.Text.UTF8Encoding]::new($false))
}

function Invoke-Native {
    param(
        [string]$Label,
        [string]$Exe,
        [string[]]$Args,
        [int[]]$OkExitCodes = @(0, 3010),
        [switch]$Optional
    )
    Add-Step $Label
    & $Exe @Args 2>&1 | ForEach-Object { Add-Step ("  " + $_.ToString().Trim()) }
    $code = $LASTEXITCODE
    if ($OkExitCodes -contains 3010 -and $code -eq 3010) {
        $global:NeedReboot = $true
        Add-Step "  (需要重启 Windows 后生效)"
    }
    if ($OkExitCodes -notcontains $code) {
        if ($Optional) {
            Add-Step "  跳过 (exit $code)"
            return $false
        }
        throw "$Label 失败 (exit $code)"
    }
    return $true
}

function Test-UbuntuInstalled {
    $list = (& wsl.exe -l -v 2>&1 | Out-String)
    return ($list -match 'Ubuntu')
}

function Update-WslWithFallbacks {
    Add-Step "停止 WSL..."
    & wsl.exe --shutdown 2>$null | Out-Null

    $attempts = @(
        @('--update', '--web-download'),
        @('--update', '--inbox'),
        @('--update')
    )
    foreach ($args in $attempts) {
        $label = "更新 WSL ($($args -join ' '))..."
        if (Invoke-Native -Label $label -Exe 'wsl.exe' -Args $args -OkExitCodes @(0) -Optional) {
            Add-Step "WSL 更新完成"
            return $true
        }
    }
    Add-Step "WSL 更新未成功（可稍后手动 wsl --update）"
    return $false
}

function Install-UbuntuWithFallbacks {
    if (Test-UbuntuInstalled) {
        Add-Step "检测到 Ubuntu 已安装"
        return $true
    }

    $attempts = @(
        @('--install', '-d', 'Ubuntu', '--no-launch'),
        @('--install', '-d', 'Ubuntu'),
        @('--install', '-d', 'Ubuntu', '--web-download'),
        @('--install')
    )
    foreach ($args in $attempts) {
        $label = "安装 Ubuntu ($($args -join ' '))..."
        if (Invoke-Native -Label $label -Exe 'wsl.exe' -Args $args -OkExitCodes @(0, 3010) -Optional) {
            Add-Step "Ubuntu 安装命令已执行"
            return $true
        }
    }

    Add-Step "尝试 winget 安装 Ubuntu..."
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if ($winget) {
        & winget.exe install --id Canonical.Ubuntu.2204 --accept-package-agreements --accept-source-agreements 2>&1 | ForEach-Object { Add-Step ("  " + $_.ToString()) }
        if ($LASTEXITCODE -eq 0 -or (Test-UbuntuInstalled)) {
            Add-Step "winget 安装 Ubuntu 完成"
            return $true
        }
    }

    return $false
}

function Wait-UbuntuReady {
    param([int]$MaxWaitSec = 120)
    $deadline = (Get-Date).AddSeconds($MaxWaitSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-UbuntuInstalled) {
            $probe = & wsl.exe -d Ubuntu -u root -- echo ok 2>&1
            if ($LASTEXITCODE -eq 0) {
                Add-Step "Ubuntu 已就绪"
                return $true
            }
        }
        Start-Sleep -Seconds 3
        Add-Step "等待 Ubuntu 就绪..."
    }
    return $false
}

function Install-DreaminaCli {
    $dreaminaInstall = @'
set -e
export DEBIAN_FRONTEND=noninteractive
if ! command -v curl >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates
fi
curl -fsSL https://jimeng.jianying.com/cli | bash
/root/.local/bin/dreamina --version
'@
    Add-Step "在 Ubuntu 中安装 dreamina CLI..."
    & wsl.exe -d Ubuntu -u root -- bash -lc $dreaminaInstall 2>&1 | ForEach-Object { Add-Step ("  " + $_.ToString()) }
    if ($LASTEXITCODE -ne 0) {
        throw "dreamina CLI 安装失败 (exit $LASTEXITCODE)"
    }
    Add-Step "dreamina CLI 安装成功"
}

$ManualGuide = @(
    "1. 右键「开始」→ Windows PowerShell（管理员）",
    "2. 执行：wsl --install -d Ubuntu",
    "3. 若提示重启，重启后再执行下一步",
    "4. 执行：wsl -d Ubuntu -u root -- bash -lc `"curl -fsSL https://jimeng.jianying.com/cli | bash`"",
    "5. 重启 server（npm start）并刷新页面",
    "",
    "Store 安装 Ubuntu：https://aka.ms/wslstore",
    "WSL2 内核：https://aka.ms/wsl2kernel"
)

# 非管理员：自提权后退出（API 一键安装会走此路径）
if (-not (Test-Admin)) {
    Write-SetupStatus -Phase "elevating" -Status "running" -Message "正在请求管理员权限，请在 UAC 弹窗中点击「是」..."
    try {
        Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass',
            '-File', $PSCommandPath,
            '-Elevated',
            '-StatusFile', $StatusFile
        ) -WindowStyle Normal
        Write-SetupStatus -Phase "elevating" -Status "running" -Message "已弹出管理员窗口，请在 UAC 中确认并等待安装完成"
        exit 0
    } catch {
        Write-SetupStatus -Phase "elevating" -Status "failed" -Message "无法启动管理员进程：$($_.Exception.Message)" -Ok $false -NeedAdmin $true -ManualGuide $ManualGuide
        exit 1
    }
}

Start-Transcript -Path $LogPath -Append -ErrorAction SilentlyContinue | Out-Null
Write-SetupStatus -Phase "start" -Status "running" -Message "开始安装 WSL + 即梦环境..."

try {
    Write-SetupStatus -Phase "features" -Status "running" -Message "启用 Windows 功能..."
    Invoke-Native -Label "启用 WSL 功能..." -Exe 'dism.exe' -Args @('/online', '/enable-feature', '/featurename:Microsoft-Windows-Subsystem-Linux', '/all', '/norestart') -OkExitCodes @(0, 3010) | Out-Null
    Invoke-Native -Label "启用虚拟机平台..." -Exe 'dism.exe' -Args @('/online', '/enable-feature', '/featurename:VirtualMachinePlatform', '/all', '/norestart') -OkExitCodes @(0, 3010) | Out-Null

    Write-SetupStatus -Phase "wsl_update" -Status "running" -Message "更新 WSL..."
    Update-WslWithFallbacks | Out-Null

    Write-SetupStatus -Phase "ubuntu" -Status "running" -Message "安装 Ubuntu..."
    if (-not (Install-UbuntuWithFallbacks)) {
        throw "Ubuntu 未能自动安装"
    }

    if ($global:NeedReboot) {
        Write-SetupStatus -Phase "reboot_required" -Status "running" -Message "Windows 功能已启用，请先重启电脑，然后再次点击「一键安装」完成 dreamina 安装" -Ok $false -ManualGuide $ManualGuide
        Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
        exit 0
    }

    Wait-UbuntuReady | Out-Null

    Write-SetupStatus -Phase "dreamina" -Status "running" -Message "安装 dreamina CLI..."
    Install-DreaminaCli

    Add-Step "验证 dreamina..."
    & wsl.exe -d Ubuntu -u root -- bash -lc '/root/.local/bin/dreamina --version' 2>&1 | ForEach-Object { Add-Step ("  " + $_.ToString()) }
    if ($LASTEXITCODE -ne 0) {
        throw "dreamina 验证失败"
    }

    $msg = "安装完成！请刷新页面并重新登录即梦（可使用 App 扫码）。"
    if ($global:NeedReboot) { $msg += " 建议重启电脑后再使用。" }
    Write-SetupStatus -Phase "done" -Status "completed" -Message $msg -Ok $true
    Add-Step "✅ $msg"
} catch {
    $err = $_.Exception.Message
    Add-Step "❌ $err"
    Write-SetupStatus -Phase "failed" -Status "failed" -Message $err -Ok $false -ManualGuide $ManualGuide
}

Stop-Transcript -ErrorAction SilentlyContinue | Out-Null

if ($Elevated) {
    # 管理员窗口保留 8 秒便于用户看到结果
    Start-Sleep -Seconds 8
}
