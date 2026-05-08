@echo off
setlocal

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo [1/2] 启动豆包本地代理...
start "Doubao Proxy" cmd /k "cd /d "%ROOT_DIR%backend" && npm run dev:doubao"

echo [2/2] 启动前端...
start "Frontend" cmd /k "cd /d "%ROOT_DIR%frontend" && npm run dev"

echo.
echo 已启动：
echo - 前端: http://localhost:5173/
echo - 豆包代理: http://127.0.0.1:5100/health
echo.
echo 提示：请保持两个新终端窗口运行。
pause
