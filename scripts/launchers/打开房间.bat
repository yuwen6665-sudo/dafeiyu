@echo off
rem 打开于笙的房间（全屏窗口）
set EDGE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist %EDGE% set EDGE="C:\Program Files\Microsoft\Edge\Application\msedge.exe"
start "" %EDGE% --app=http://127.0.0.1:8848/room.html --start-fullscreen --force-device-scale-factor=1 --autoplay-policy=no-user-gesture-required