@echo off
cd /d "C:\Users\anton\Documents\ChatGPT\site scepi"
echo Démarrage du serveur local pour SCEP Invaders...
echo Servant le site depuis le dossier 'site' sur http://127.0.0.1:8000
echo.
echo Ouverture du site dans votre navigateur par défaut...
start http://127.0.0.1:8000
echo.
echo Appuyez sur Ctrl+C pour arrêter le serveur
echo.
py -m http.server 8000 --bind 127.0.0.1 --directory site