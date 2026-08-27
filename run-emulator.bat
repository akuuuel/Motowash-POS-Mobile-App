@echo off
title Launching Koko MotoWash on Android Emulator...
cd /d "%~dp0"

if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" (
    "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\run-emulator.ps1"
) else (
    pwsh -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\run-emulator.ps1"
)

if %errorlevel% neq 0 pause
