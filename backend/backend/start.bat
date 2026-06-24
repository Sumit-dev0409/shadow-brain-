@echo off
title Brain Shadow Backend
echo.
echo  ╔══════════════════════════════════════╗
echo  ║     Brain Shadow Backend Server      ║
echo  ║     http://localhost:8000            ║
echo  ╚══════════════════════════════════════╝
echo.
cd /d "%~dp0"
node src/server.js
pause
