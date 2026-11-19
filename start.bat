@echo off
title Plan de Maison Anime - 3D Walkthrough
echo ===================================================
echo   Lancement du Plan de Maison 3D Interactif
echo ===================================================
cd /d "%~dp0"
rem Use the user's existing private OpenRouter .env without copying the key into this project.
if exist "%USERPROFILE%\Desktop\K1_MATHINFO_CLOUD\.env" set "OPENROUTER_ENV_FILE=%USERPROFILE%\Desktop\K1_MATHINFO_CLOUD\.env"
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    start "" http://localhost:8000/index.html
    node serve.js
    goto :end
)
echo Node.js est requis pour le serveur local, l'editeur et les fonctions IA.
echo Installez Node.js LTS puis relancez ce fichier.
:end
pause
