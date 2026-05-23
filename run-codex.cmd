@echo off
setlocal

set "WSL_DISTRO=Ubuntu"
set "LAUNCHER_WIN=%~dp0run-codex-wsl.sh"

for /f "usebackq delims=" %%I in (`wsl.exe -d %WSL_DISTRO% -- wslpath -a "%LAUNCHER_WIN%"`) do set "LAUNCHER_WSL=%%I"

where wt.exe >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  start "" wt.exe wsl.exe -d %WSL_DISTRO% -- bash "%LAUNCHER_WSL%"
) else (
  wsl.exe -d %WSL_DISTRO% -- bash "%LAUNCHER_WSL%"
  pause
)
