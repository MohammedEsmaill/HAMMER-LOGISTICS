@echo off
rem Is HAMMER LINE set to start with Windows, and is it running now?
set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\HAMMER LINE.bat"
if exist "%LINK%" (echo Starts with Windows: yes) else (echo Starts with Windows: no ^(autostart-install.bat^))
docker info >nul 2>&1 && (echo Docker: running) || (echo Docker: NOT running - open Docker Desktop)
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/health -TimeoutSec 5; 'API: running' } catch { 'API: NOT running - run start.bat' }"
netstat -ano | findstr /r /c:":4173 .*LISTENING" >nul && (echo Web app: running on http://localhost:4173) || (echo Web app: NOT running - run start.bat)
pause
