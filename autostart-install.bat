@echo off
rem HAMMER LINE starts by itself when you sign in to Windows (minimized, no browser).
rem Docker Desktop must also start with Windows: Docker Desktop, Settings, General,
rem "Start Docker Desktop when you sign in to your computer".
set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\HAMMER LINE.bat"
(
  echo @echo off
  echo start "HAMMER LINE" /min cmd /c ""%~dp0start.bat" --auto"
) > "%LINK%"
echo HAMMER LINE will start by itself from the next sign-in.
echo To undo: autostart-remove.bat
pause
