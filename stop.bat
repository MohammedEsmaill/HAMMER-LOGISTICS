@echo off
rem HAMMER LINE: stops the API, the web app and the link (the database stays in Docker).
taskkill /fi "WINDOWTITLE eq HAMMER - *" /t /f >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3000 .*LISTENING" /c:":4173 .*LISTENING"') do taskkill /pid %%p /t /f >nul 2>&1
echo HAMMER LINE stopped.
timeout /t 3 >nul
