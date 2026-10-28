@echo off
rem Abre o Lumiar como programa (Electron), compilando antes a versão mais recente do código.
rem Na primeira vez também instala as dependências e baixa os modelos de IA.
chcp 65001 >nul
title Lumiar
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js não foi encontrado. Instale a versão 22 ou mais nova em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Instalando as dependências, só na primeira vez...
  call npm install
  if errorlevel 1 goto erro
  if not exist "node_modules\electron\dist\electron.exe" call node node_modules\electron\install.js
)

if not exist "public\models\tts" (
  echo Baixando os modelos de IA, cerca de 470 MB, só na primeira vez...
  call npm run setup
  if errorlevel 1 goto erro
)

echo Preparando o Lumiar...
call npm run build >"%TEMP%\lumiar-build.log" 2>&1
if errorlevel 1 (
  type "%TEMP%\lumiar-build.log"
  goto erro
)

rem Se essa variável estiver ligada, o Electron roda como Node e a janela não abre.
set ELECTRON_RUN_AS_NODE=
start "" "node_modules\electron\dist\electron.exe" .
exit /b 0

:erro
echo.
echo Algo deu errado. Veja as mensagens acima.
pause
exit /b 1
