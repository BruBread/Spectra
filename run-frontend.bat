@echo off
setlocal
cd /d "%~dp0frontend-spectra"

if not exist ".env.local" (
  if exist ".env.local.example" (
    copy ".env.local.example" ".env.local" >nul
    echo Created frontend-spectra\.env.local from .env.local.example
  )
)

if not exist "node_modules" (
  echo Installing frontend dependencies...
  call npm install
)

echo Starting frontend...
call npm run dev

endlocal
