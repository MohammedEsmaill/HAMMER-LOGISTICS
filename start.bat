@echo off
rem HAMMER LINE: start everything with a double-click.
rem The database (Docker), the API, the web app, and the share link if cloudflared.exe is found.
setlocal
cd /d "%~dp0"

echo [1/4] Database (Docker Desktop must be open)...
docker compose up -d
if errorlevel 1 (
  echo.
  echo Docker is not running. Open Docker Desktop, wait for "Engine running", then run start.bat again.
  pause
  exit /b 1
)
set /a tries=0
:waitdb
docker compose exec -T db pg_isready -U hammer >nul 2>&1
if not errorlevel 1 goto dbready
set /a tries+=1
if %tries% geq 30 (
  echo The database did not start. Send the messages above.
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto waitdb
:dbready

if not exist "apps\api\dist\main.js" (
  echo The API is not built yet. Run update.bat first.
  pause
  exit /b 1
)
if not exist "apps\web\dist\index.html" (
  echo The web app is not built yet. Run update.bat first.
  pause
  exit /b 1
)

echo [2/4] API on http://localhost:3000 ...
start "HAMMER - API" /d "%~dp0apps\api" cmd /k node dist/main.js

echo [3/4] Web app on http://localhost:4173 ...
start "HAMMER - WEB" /d "%~dp0apps\web" cmd /k npx vite preview

set "CF="
if exist "%~dp0cloudflared.exe" set "CF=%~dp0cloudflared.exe"
if not defined CF if exist "%~dp0..\cloudflared.exe" set "CF=%~dp0..\cloudflared.exe"
if not defined CF for /f "delims=" %%i in ('where cloudflared 2^>nul') do if not defined CF set "CF=%%i"
if defined CF (
  echo [4/4] Share link: look in the "HAMMER - LINK" window for https://....trycloudflare.com
  start "HAMMER - LINK" cmd /k ""%CF%" tunnel --url http://localhost:4173"
) else (
  echo [4/4] cloudflared.exe not found, so no share link. The system still works on this computer.
)

timeout /t 6 /nobreak >nul
start "" http://localhost:4173
echo.
echo Running. To stop: close the HAMMER windows.
timeout /t 5 >nul
