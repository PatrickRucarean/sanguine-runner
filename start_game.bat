@echo off
title SANGUINE_RUNNER - Local Game Server (120Hz)
echo ==========================================================
echo   SANGUINE_RUNNER // Starting Local Server on Port 8080
echo ==========================================================
start "" "http://127.0.0.1:8080"
python -m http.server 8080 --bind 127.0.0.1
