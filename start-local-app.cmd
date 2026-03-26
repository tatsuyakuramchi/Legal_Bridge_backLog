@echo off
setlocal

cd /d "%~dp0"
title Legal Bridge Local App

if not exist ".env" (
  echo [.env not found]
  echo Create ".env" before starting the app.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [Node.js not found]
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [Installing dependencies]
  call npm.cmd install
  if errorlevel 1 goto :error
)

echo [Opening browser] http://localhost:3005
start "" "http://localhost:3005"

echo [Starting app]
call npm.cmd run dev
if errorlevel 1 goto :error

exit /b 0

:error
echo.
echo [Startup failed]
pause
exit /b 1
