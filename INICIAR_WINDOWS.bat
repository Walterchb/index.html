@echo off
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Instala Python 3 desde python.org y vuelve a ejecutar este archivo.
  echo Tambien puedes publicar directamente con GitHub Desktop siguiendo la guia.
  pause
  exit /b 1
)
start "" http://localhost:8080/
py -m http.server 8080 --bind 127.0.0.1
pause
