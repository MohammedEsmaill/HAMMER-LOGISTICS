@echo off
rem HAMMER LINE: get the latest code and rebuild. Run it after every update, then start.bat.
rem Close the HAMMER windows first.
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
  echo The system is still running. Close the HAMMER windows, then run update.bat again.
  pause
  exit /b 1
)

echo [1/5] Latest code...
git pull || goto failed

echo [2/5] Database...
docker compose up -d || goto failed

echo [3/5] API: packages, database changes, build...
pushd apps\api
call npm ci || goto failed
call npx prisma migrate deploy || goto failed
call npx prisma db seed || goto failed
call npm run build || goto failed
popd

echo [4/5] Web app: packages and build...
pushd apps\web
call npm ci || goto failed
call npm run build || goto failed
popd

echo [5/5] Done. Now run start.bat
pause
exit /b 0

:failed
echo.
echo Something failed. Send the messages above (no passwords).
pause
exit /b 1
