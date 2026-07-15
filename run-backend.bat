@echo off
setlocal
set APP_ENV=local
cd /d "%~dp0backend-spectra"

if not exist ".env.local" (
  if exist ".env.local.example" (
    copy ".env.local.example" ".env.local" >nul
    echo Created backend-spectra\.env.local from .env.local.example - edit it with real secrets before connecting to real services.
  )
)

if not exist "node_modules" (
  echo Installing backend dependencies...
  call npm install
)

echo Starting backend (APP_ENV=%APP_ENV%)...
call npm run dev

endlocal
