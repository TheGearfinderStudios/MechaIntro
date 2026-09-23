@echo off
rem ============================================================
rem  MechaIntro, from source. Pass --dev to open DevTools too:
rem    start.bat --dev
rem ============================================================

cd /d "%~dp0"

if not exist node_modules (
	echo Installing dependencies...
	call npm install
	if errorlevel 1 (
		pause
		exit /b 1
	)
)

node scripts/start.mjs %*
