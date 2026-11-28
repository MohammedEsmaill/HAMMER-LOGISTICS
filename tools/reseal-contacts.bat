@echo off
rem HAMMER LINE: when FIELD_ENCRYPTION_KEY was changed after the national IDs and phones
rem were encrypted, takes them back from the last backup made before the update and
rem lets the system encrypt them again with the current key. Close the system first.
setlocal
cd /d "%~dp0.."

set "SRC="
for /f "delims=" %%f in ('dir /b /o-d "apps\api\backups\*_pre_update.dump" 2^>nul') do if not defined SRC set "SRC=apps\api\backups\%%f"
if not defined SRC (
  echo No backup made before an update was found in apps\api\backups.
  pause
  exit /b 1
)
echo Taking the numbers from: %SRC%

docker compose up -d db >nul || goto failed
for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set "STAMP=%%t"
set "DUMP=apps\api\backups\hammer_%STAMP%_before_reseal.dump"
docker compose exec -T db pg_dump -U hammer --format=custom --no-owner --no-privileges hammer_logistics > "%DUMP%"
if errorlevel 1 goto failed
for %%s in ("%DUMP%") do if %%~zs lss 1000 goto failed
echo Backup saved: %DUMP%

docker compose cp "%SRC%" db:/tmp/hammer_restore.dump || goto failed
docker compose exec -T db psql -U hammer -d postgres -q -c "DROP DATABASE IF EXISTS hammer_restore" -c "CREATE DATABASE hammer_restore" || goto failed
docker compose exec -T db pg_restore -U hammer -d hammer_restore --no-owner --no-privileges /tmp/hammer_restore.dump >nul 2>&1
docker compose exec -T db psql -U hammer -d hammer_logistics -q -v "restore=dbname=hammer_restore user=hammer" < tools\reseal-contacts.sql
set "RESULT=%errorlevel%"
docker compose exec -T db psql -U hammer -d postgres -q -c "DROP DATABASE IF EXISTS hammer_restore"
docker compose exec -T db rm -f /tmp/hammer_restore.dump
if not "%RESULT%"=="0" (
  echo Nothing was changed.
  pause
  exit /b 1
)
echo.
echo Done. Start the system (start.bat): it encrypts them again with the current key.
pause
exit /b 0

:failed
echo Could not reach the database or take the backup. Nothing was changed.
pause
exit /b 1
