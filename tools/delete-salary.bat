@echo off
rem HAMMER LINE: deletes one salary still under review, and returns its money to the
rem cash box or bank it came from. Takes a database backup first.
setlocal
cd /d "%~dp0.."
set /p CODE=Employee code (example 22): 
set /p MONTH=Salary month as YYYY-MM (example 2026-11): 
if "%CODE%"=="" goto usage
if "%MONTH%"=="" goto usage

docker compose up -d db >nul || goto failed
for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set "STAMP=%%t"
if not exist "apps\api\backups" mkdir "apps\api\backups"
set "DUMP=apps\api\backups\hammer_%STAMP%_before_delete_salary.dump"
docker compose exec -T db pg_dump -U hammer --format=custom --no-owner --no-privileges hammer_logistics > "%DUMP%"
if errorlevel 1 goto failed
for %%s in ("%DUMP%") do if %%~zs lss 1000 goto failed
echo Backup saved: %DUMP%

docker compose exec -T db psql -U hammer -d hammer_logistics -q -v code=%CODE% -v month=%MONTH% < tools\delete-salary.sql
if errorlevel 1 (
  echo Nothing was deleted.
  pause
  exit /b 1
)
pause
exit /b 0

:usage
echo Enter the employee code and the month.
pause
exit /b 1

:failed
echo Could not reach the database or take the backup. Nothing was deleted.
pause
exit /b 1
