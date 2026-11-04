@echo off
rem StundenKompass ist jetzt ein Team-Betrieb: dieser Rechner wird zum Server,
rem alle anderen oeffnen nur noch eine Adresse im Browser. Diese Datei bleibt
rem aus Gewohnheit erhalten und startet einfach den Server.
cd /d "%~dp0"
call Start-Server.bat
