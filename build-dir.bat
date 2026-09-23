@echo off
rem ============================================================
rem  MechaIntro quick build, no installer.
rem
rem  Packages the app into dist\win-unpacked\ and stops there:
rem  run dist\win-unpacked\MechaIntro.exe to try the packaged
rem  app (ffmpeg unpacked from the asar, paths as installed)
rem  without waiting on the installer. Skips the tests.
rem
rem  Options are passed straight to electron-builder.
rem ============================================================

setlocal
cd /d "%~dp0"

rem Leaked by Electron-based editors (VS Code); it makes Electron run as plain Node.
set ELECTRON_RUN_AS_NODE=

if not exist node_modules (
	echo Installing dependencies...
	call npm install
	if errorlevel 1 goto :failed
)

call npx electron-builder --win --dir %*
if errorlevel 1 goto :failed

echo.
echo Done. Run "%~dp0dist\win-unpacked\MechaIntro.exe".
pause
exit /b 0

:failed
echo.
echo Build failed.
pause
exit /b 1
