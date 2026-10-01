@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SCEP Invaders - lanceur

where node >nul 2>nul || (
  echo Node.js est introuvable : installez-le depuis https://nodejs.org puis relancez.
  pause
  exit /b 1
)

if not exist node_modules\.bin\wrangler.cmd (
  echo Installation des dependances...
  call npm install --include=optional || goto :erreur
)

echo Compilation du jeu de coinche...
call npm run build || goto :erreur

rem Site + coinche en ligne, comme sur la beta (Cloudflare Workers en local).
echo Demarrage du site et de la coinche en ligne (port 8000)...
start "SCEP - site" cmd /k node_modules\.bin\wrangler.cmd dev --port 8000

rem Ouvre le navigateur des que le site repond (2 minutes au plus).
echo Attente du serveur...
set /a essais=0
:attente
ping -n 3 127.0.0.1 >nul
curl -s -o nul http://localhost:8000/ && goto :pret
set /a essais+=1
if %essais% lss 60 goto :attente
echo Le serveur ne repond pas : ouvrez http://localhost:8000 a la main.
goto :fin
:pret
start "" http://localhost:8000/
:fin

echo.
echo Tout est lance : site sur http://localhost:8000
echo Fermez la fenetre "SCEP - site" pour tout arreter.
timeout /t 5 >nul
exit /b 0

:erreur
echo.
echo Echec de l'installation ou de la compilation (voir le message ci-dessus).
pause
exit /b 1
