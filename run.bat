@echo off
setlocal

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%frontend"

echo 启动前端（纯前端，默认 http://localhost:5173/）...
echo.
start "Frontend" cmd /k "cd /d "%ROOT_DIR%frontend" && npm run dev"

echo.
echo 已启动前端开发服务器。
pause
