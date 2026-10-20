@echo off
cd /d "%~dp0"
node scripts/hero.mjs start
if errorlevel 1 pause
