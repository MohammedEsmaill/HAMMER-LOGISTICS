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

rem the share link: cloudflared in its own window, its log read here for the link
set "CF="
if exist "%~dp0cloudflared.exe" set "CF=%~dp0cloudflared.exe"
if not defined CF if exist "%~dp0..\cloudflared.exe" set "CF=%~dp0..\cloudflared.exe"
if not defined CF for /f "delims=" %%i in ('where cloudflared 2^>nul') do if not defined CF set "CF=%%i"
if not defined CF goto nocf

echo [4/4] Share link...
set "LOG=%TEMP%\hammer-link.log"
if exist "%LOG%" del "%LOG%"
start "HAMMER - LINK" /min "%CF%" tunnel --url http://localhost:4173 --logfile "%LOG%"

set "LINK="
set /a waited=0
:waitlink
timeout /t 2 /nobreak >nul
call :findlink
if defined LINK goto gotlink
set /a waited+=2
if %waited% lss 60 goto waitlink
echo.
echo The share link did not come up within a minute. Check the internet connection,
echo then close the HAMMER windows and run start.bat again.
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
echo   It changes every time start.bat runs.
echo ================================================================
goto opened

:nocf
echo [4/4] cloudflared.exe not found next to start.bat, so no share link.
echo       Put cloudflared.exe in %~dp0 and run start.bat again.

:opened
start "" http://localhost:4173
echo.
echo Running. To stop: close the HAMMER windows. Keep this window to see the link.
pause
exit /b 0

rem Reads cloudflared's log for the tunnel link (https://<words>.trycloudflare.com),
rem skipping its own API address. Sets LINK, or leaves it empty.
:findlink
if not exist "%LOG%" exit /b 0
setlocal EnableDelayedExpansion
set "found="
for /f "usebackq delims=" %%A in (`findstr /i /c:".trycloudflare.com" "%LOG%"`) do (
  set "line=%%A"
  set "line=!line:"= !"
  set "line=!line:|= !"
  for %%W in (!line!) do (
    set "word=%%W"
    if not defined found if /i "!word:~0,8!"=="https://" if /i "!word:~-18!"==".trycloudflare.com" if /i not "!word!"=="https://api.trycloudflare.com" set "found=!word!"
  )
)
endlocal & set "LINK=%found%"
exit /b 0
