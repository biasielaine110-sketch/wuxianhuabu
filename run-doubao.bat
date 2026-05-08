@echo off
setlocal

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%backend"

echo 启动豆包本地代理...
call npm run dev:doubao
