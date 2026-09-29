@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SCEP Invaders - lanceur

where node >nul 2>nul || (
  echo Node.js est introuvable : installez-le depuis https://nodejs.org puis relancez.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installation des dependances...
  call npm install || goto :erreur
)

echo Compilation du jeu de coinche...
call npm run build || goto :erreur

echo Demarrage du serveur de coinche (port 8001)...
start "SCEP - serveur de coinche" cmd /k npm run server

echo Demarrage du site (port 8000)...
start "SCEP - site" cmd /k npx --yes serve site -l 8000

timeout /t 3 /nobreak >nul
start "" http://localhost:8000/jeux/coinche/

echo.
echo Tout est lance : site sur http://localhost:8000
echo Fermez les deux fenetres "SCEP - ..." pour tout arreter.
timeout /t 5 >nul
exit /b 0

:erreur
echo.
echo Echec de l'installation ou de la compilation (voir le message ci-dessus).
pause
exit /b 1
