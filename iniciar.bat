@echo off
title Dashboard Ranking PHP
cd /d "%~dp0"

if not exist "C:\xampp\php\php.exe" (
  echo PHP nao encontrado em C:\xampp\php\php.exe
  echo Verifique se o XAMPP esta instalado no caminho padrao.
  pause
  exit /b 1
)

echo.
echo Dashboard Ranking iniciado em:
echo http://localhost:8000
echo.
echo Painel administrativo:
echo http://localhost:8000/superadminana.html
echo.
echo Para desligar, pressione Ctrl+C.
echo.

"C:\xampp\php\php.exe" -S localhost:8000 router.php
pause
