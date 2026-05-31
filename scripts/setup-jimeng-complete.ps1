# 完整安装 + 登录引导（调用基础 WSL 安装脚本）
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $ScriptDir 'setup-jimeng-dreamina-wsl.ps1') @args
