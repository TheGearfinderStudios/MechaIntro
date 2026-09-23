@echo off
rem ============================================================
rem  MechaIntro Windows build.
rem
rem  Produces the installer in dist\:
rem    dist\MechaIntro Setup <version>.exe
rem  and the unpacked app it installs, in dist\win-unpacked\.
rem
rem  Installs dependencies first when node_modules is missing
rem  (that also builds the icon catalogue), and runs the tests
rem  before packaging, so a broken core never gets shipped.
rem
rem  Options are passed straight to electron-builder, so:
rem    build.bat --publish never
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

echo.
echo Running tests...
call npm test
if errorlevel 1 goto :failed

echo.
echo Packaging...
call npx electron-builder --win nsis %*
if errorlevel 1 goto :failed

echo.
echo Done. Installer is in "%~dp0dist".
pause
exit /b 0

:failed
echo.
echo Build failed.
pause
exit /b 1
