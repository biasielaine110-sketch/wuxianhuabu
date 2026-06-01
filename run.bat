@echo off
setlocal

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo 启动即梦后端 (http://localhost:3107) ...
start "JimengServer" cmd /k "cd /d "%ROOT_DIR%server" && npm start"

echo 启动前端 (http://localhost:5173/) ...
start "Frontend" cmd /k "cd /d "%ROOT_DIR%frontend" && npm run dev"

echo.
echo 已启动：
echo   - 即梦后端: server 目录 npm start  ^(端口 3107^)
echo   - 前端开发: frontend 目录 npm run dev  ^(端口 5173^)
echo.
echo 即梦登录/验证需两个服务都在运行。若仅打开前端会出现「无法验证登录」。
pause
