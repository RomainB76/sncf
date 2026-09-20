@echo off
title Suivi des anomalies
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serveur.ps1"
if errorlevel 1 pause
