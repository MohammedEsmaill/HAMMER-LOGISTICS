@echo off
rem HAMMER LINE: when FIELD_ENCRYPTION_KEY was changed after the national IDs and phones
rem were encrypted, takes them back from the newest backup that still holds them in
rem plain text, and lets the system encrypt them again with the current key.
rem Close the system first.
setlocal
cd /d "%~dp0.."

docker compose up -d db >nul || goto failed
for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set "STAMP=%%t"
set "DUMP=apps\api\backups\hammer_%STAMP%_before_reseal.dump"
docker compose exec -T db pg_dump -U hammer --format=custom --no-owner --no-privileges hammer_logistics > "%DUMP%"
if errorlevel 1 goto failed
for %%s in ("%DUMP%") do if %%~zs lss 1000 goto failed
echo Backup saved: %DUMP%
echo.
echo Looking for a backup with the numbers in plain text (newest first)...

set "SRC="
for /f "delims=" %%f in ('dir /b /o-d "apps\api\backups\*.dump" 2^>nul') do call :try "%%f"
if not defined SRC (
  echo No backup holds the numbers in plain text. Nothing was changed.
  call :cleanup
  pause
  exit /b 1
)
echo Taking the numbers from: %SRC%

docker compose exec -T db psql -U hammer -d hammer_logistics -q -v "restore=dbname=hammer_restore user=hammer" < tools\reseal-contacts.sql
set "RESULT=%errorlevel%"
call :cleanup
if not "%RESULT%"=="0" (
  echo Nothing was changed.
  pause
  exit /b 1
)
echo.
echo Done. Start the system (start.bat): it encrypts them again with the current key.
pause
exit /b 0

rem Restores one backup into hammer_restore and keeps it when its numbers are plain text.
:try
if defined SRC exit /b 0
set "PLAIN=0"
docker compose cp "apps\api\backups\%~1" db:/tmp/hammer_restore.dump >nul 2>&1 || exit /b 0
docker compose exec -T db psql -U hammer -d postgres -q -c "DROP DATABASE IF EXISTS hammer_restore" -c "CREATE DATABASE hammer_restore" >nul 2>&1 || exit /b 0
docker compose exec -T db pg_restore -U hammer -d hammer_restore --no-owner --no-privileges /tmp/hammer_restore.dump >nul 2>&1
for /f "usebackq" %%n in (`docker compose exec -T db psql -U hammer -d hammer_restore -tAc "SELECT CASE WHEN bool_and(left(national_id, 4) <> 'enc:') THEN count(*) ELSE 0 END FROM employees"`) do set "PLAIN=%%n"
echo   %~1: %PLAIN% in plain text
if not "%PLAIN%"=="0" if not "%PLAIN%"=="" set "SRC=%~1"
exit /b 0

:cleanup
docker compose exec -T db psql -U hammer -d postgres -q -c "DROP DATABASE IF EXISTS hammer_restore" >nul 2>&1
docker compose exec -T db rm -f /tmp/hammer_restore.dump >nul 2>&1
exit /b 0

:failed
echo Could not reach the database or take the backup. Nothing was changed.
pause
exit /b 1
