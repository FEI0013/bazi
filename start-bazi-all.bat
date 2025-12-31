@echo off
setlocal
set PROJECT=D:\HOREY\flask_apps\bazi\bazi5.0

REM Start Node server in a dedicated window (keeps console open)
start "BAZI SERVER" cmd /k "cd /d %PROJECT% && node server.js"

REM Start Cloudflared tunnel in a dedicated window (keeps console open)
start "CLOUDFLARED TUNNEL" cmd /k "cloudflared tunnel run bazi"

echo.
echo Two windows have been opened:
echo   - BAZI SERVER (local: http://localhost:3000)
echo   - CLOUDFLARED TUNNEL (public: https://bazi.fei0013.co)
echo Close a window to stop that component.
