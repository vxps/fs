@echo off
cd /d "%~dp0backend"
if not exist ".venv\Scripts\python.exe" (
  echo [FitSpot] Creating Python virtual environment...
  python -m venv .venv
  if errorlevel 1 goto :error
)
echo [FitSpot] Installing or checking Python dependencies...
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto :error
echo [FitSpot] FastAPI at http://127.0.0.1:8000/docs
".venv\Scripts\python.exe" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
pause
exit /b
:error
echo Failed to launch FitSpot API. Check Python is installed.
pause
exit /b 1
