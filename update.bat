@echo off
rem HAMMER LINE: get the latest code and rebuild. Run it after every update, then start.bat.
rem Close the HAMMER windows first. Before anything it backs up the database; if the
rem update fails or the new version does not start, it goes back to the old code and data.
setlocal
rem git pull can change this file while it runs, so run a copy of it
if /i not "%~1"=="--copy" (
  copy /y "%~f0" "%TEMP%\hammer-update.bat" >nul
  call "%TEMP%\hammer-update.bat" --copy "%~dp0"
  exit /b
)
cd /d "%~2"

rem the running system locks its files, and npm cannot replace them
netstat -ano | findstr /r /c:":3000 .*LISTENING" /c:":4173 .*LISTENING" >nul
if not errorlevel 1 (
  echo The system is still running. Close the HAMMER windows ^(or run stop.bat^), then run update.bat again.
  pause
  exit /b 1
)

echo [1/6] Database and a backup before the update...
docker compose up -d || goto failed_early
set /a tries=0
:waitdb
docker compose exec -T db pg_isready -U hammer >nul 2>&1
if not errorlevel 1 goto dbready
set /a tries+=1
if %tries% geq 60 goto failed_early
timeout /t 1 /nobreak >nul
goto waitdb
:dbready
for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set "STAMP=%%t"
if not exist "apps\api\backups" mkdir "apps\api\backups"
set "DUMP=apps\api\backups\hammer_%STAMP%_pre_update.dump"
docker compose exec -T db pg_dump -U hammer --format=custom --no-owner --no-privileges hammer_logistics > "%DUMP%"
if errorlevel 1 goto failed_early
for %%s in ("%DUMP%") do if %%~zs lss 1000 goto failed_early
echo       saved %DUMP%
set "PREV="
for /f %%c in ('git rev-parse HEAD') do set "PREV=%%c"
if not defined PREV goto failed_early

echo [2/6] Latest code...
git pull || goto rollback

echo [3/6] API: packages, database changes, build...
pushd apps\api
rem the key that encrypts national IDs and phones: made once, never replaced
findstr /b /c:"FIELD_ENCRYPTION_KEY=" .env >nul 2>&1
if errorlevel 1 call :newkey
call npm install --no-audit --no-fund || (popd & goto rollback)
call npx prisma migrate deploy || (popd & goto rollback)
call npx prisma db seed || (popd & goto rollback)
call npm run build || (popd & goto rollback)
popd

echo [4/6] Web app: packages and build...
pushd apps\web
call npm install --no-audit --no-fund || (popd & goto rollback)
call npm run build || (popd & goto rollback)
popd

echo [5/6] Checking that the new version starts...
call :trystart || goto rollback

echo [6/6] Done. Now run start.bat
pause
exit /b 0

rem Adds a new random FIELD_ENCRYPTION_KEY to apps\api\.env (run from apps\api).
:newkey
powershell -NoProfile -Command ^
  "$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b);" ^
  "$q = [char]34; Add-Content -Path '.env' -Value ([Environment]::NewLine + 'FIELD_ENCRYPTION_KEY=' + $q + [Convert]::ToBase64String($b) + $q)"
echo.
echo       A new encryption key was added to apps\api\.env (FIELD_ENCRYPTION_KEY).
echo       Copy that line somewhere safe, away from this computer and its backups:
echo       without it the national IDs and phones in a restored backup cannot be read.
echo.
exit /b 0

rem Starts the API hidden, waits up to 2 minutes for it to answer, then stops it.
:trystart
powershell -NoProfile -Command ^
  "$p = Start-Process node -ArgumentList 'dist/main.js' -WorkingDirectory 'apps\api' -PassThru -WindowStyle Hidden;" ^
  "$ok = $false;" ^
  "for ($i = 0; $i -lt 60; $i++) { Start-Sleep 2; if ($p.HasExited) { break };" ^
  "  try { if ((Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/health -TimeoutSec 3).StatusCode -eq 200) { $ok = $true; break } } catch {} };" ^
  "if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force };" ^
  "if ($ok) { exit 0 } else { exit 1 }"
exit /b %errorlevel%

:rollback
echo.
echo ================================================================
echo   The update failed. Going back to the previous version and data...
echo ================================================================
git reset --hard %PREV%
docker compose exec -T db pg_restore -U hammer --clean --if-exists --no-owner --no-privileges --single-transaction -d hammer_logistics < "%DUMP%"
if errorlevel 1 echo Could not restore the data. It is saved in %DUMP%
pushd apps\api
call npm install --no-audit --no-fund
call npm run build
popd
pushd apps\web
call npm install --no-audit --no-fund
call npm run build
popd
echo.
echo Back on the previous version. Run start.bat to keep working,
echo and send the messages above (no passwords).
pause
exit /b 1

:failed_early
echo.
echo Could not back up the database, so nothing was changed. Is Docker Desktop running?
echo Send the messages above (no passwords).
pause
exit /b 1
