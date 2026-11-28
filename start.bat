@echo off
rem HAMMER LINE: start everything with a double-click.
rem The database (Docker), the API, the web app, and the share link if cloudflared.exe is found.
setlocal
cd /d "%~dp0"
rem --auto: started with Windows (autostart-install.bat): minimized windows, no browser,
rem and it waits for Docker Desktop to come up first
set "AUTO="
if /i "%~1"=="--auto" set "AUTO=1"
set "MIN="
if defined AUTO set "MIN=/min"
if not defined AUTO goto dockercheck
echo Waiting for Docker Desktop...
set /a dtries=0
:waitdocker
docker info >nul 2>&1
if not errorlevel 1 goto dockercheck
set /a dtries+=1
if %dtries% geq 100 goto dockercheck
timeout /t 3 /nobreak >nul
goto waitdocker
:dockercheck

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

rem the share link: the API itself starts cloudflared, checks the link every 30 seconds,
rem starts it again when it drops, and sends it to the staff WhatsApp group
set "CF="
if exist "%~dp0ngrok-domain.txt" goto startapi
if exist "%~dp0cloudflared.exe" set "CF=%~dp0cloudflared.exe"
if not defined CF if exist "%~dp0..\cloudflared.exe" set "CF=%~dp0..\cloudflared.exe"
if not defined CF for /f "delims=" %%i in ('where cloudflared 2^>nul') do if not defined CF set "CF=%%i"
if defined CF set "SHARE_TUNNEL_BIN=%CF%"
if exist "apps\api\share-link.txt" del "apps\api\share-link.txt"
:startapi

echo [2/4] API on http://localhost:3000 ...
start "HAMMER - API" %MIN% /d "%~dp0apps\api" cmd /k node dist/main.js

echo [3/4] Web app on http://localhost:4173 ...
start "HAMMER - WEB" %MIN% /d "%~dp0apps\web" cmd /k npx vite preview

rem The web app on Vercel reaches this computer's API through a fixed ngrok link,
rem when ngrok-domain.txt (next to start.bat) holds the domain, e.g. hammer.ngrok-free.app
if not exist "%~dp0ngrok-domain.txt" goto cloudflare
set "DOMAIN="
set /p DOMAIN=<"%~dp0ngrok-domain.txt"
set "DOMAIN=%DOMAIN:https://=%"
set "DOMAIN=%DOMAIN:/=%"
set "DOMAIN=%DOMAIN: =%"
set "NG="
if exist "%~dp0ngrok.exe" set "NG=%~dp0ngrok.exe"
if not defined NG if exist "%~dp0..\ngrok.exe" set "NG=%~dp0..\ngrok.exe"
if not defined NG for /f "delims=" %%i in ('where ngrok 2^>nul') do if not defined NG set "NG=%%i"
if not defined NG (
  echo [4/4] ngrok.exe not found next to start.bat. Put it there and run start.bat again.
  goto opened
)
echo [4/4] API link for the Vercel site: https://%DOMAIN%
start "HAMMER - API LINK" /min "%NG%" http --domain=%DOMAIN% 3000
echo.
echo ================================================================
echo   The Vercel site works while this computer and the HAMMER windows stay on.
echo ================================================================
goto opened

:cloudflare
if not defined CF goto nocf
echo [4/4] Share link...
set "LINK="
set /a waited=0
:waitlink
timeout /t 2 /nobreak >nul
if exist "apps\api\share-link.txt" set /p LINK=<"apps\api\share-link.txt"
if defined LINK goto gotlink
set /a waited+=2
if %waited% lss 90 goto waitlink
echo.
echo The share link did not come up yet. The API keeps trying, and sends it to the
echo WhatsApp group when it does. It is also in apps\api\share-link.txt.
goto opened

:gotlink
<nul set /p "=%LINK%"| clip
echo.
echo ================================================================
echo   Share link (already copied, paste it with Ctrl+V):
echo(
echo(  %LINK%
echo(
echo   It may take up to a minute before it opens on other devices.
echo   It changes every time start.bat runs. If it drops during the day, the system
echo   opens a new one by itself and sends it to the WhatsApp group.
echo ================================================================
goto opened

:nocf
echo [4/4] cloudflared.exe not found next to start.bat, so no share link.
echo       Put cloudflared.exe in %~dp0 and run start.bat again.

:opened
if not defined AUTO start "" http://localhost:4173
echo.
echo Running. To stop: close the HAMMER windows (or run stop.bat). Keep this window to see the link.
if defined AUTO exit /b 0
pause
exit /b 0
