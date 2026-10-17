@echo off
cd /d "%~dp0frontend"
if not exist "node_modules\vite" (
  echo [FitSpot] Installing frontend dependencies...
  call npm.cmd install
  if errorlevel 1 goto :error
)
echo [FitSpot] Frontend at http://127.0.0.1:5173/
call npm.cmd run dev
pause
exit /b
:error
echo Failed to launch frontend. Check Node.js is installed.
pause
exit /b 1
