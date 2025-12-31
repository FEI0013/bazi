@echo off
echo Stopping cloudflared and node processes (this may stop other Node tasks).
taskkill /IM cloudflared.exe /F >nul 2>&1
taskkill /IM node.exe /F >nul 2>&1
echo Done.
