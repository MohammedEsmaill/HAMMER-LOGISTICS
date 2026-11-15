@echo off
set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\HAMMER LINE.bat"
if exist "%LINK%" del "%LINK%"
echo HAMMER LINE no longer starts by itself. Use start.bat.
pause
