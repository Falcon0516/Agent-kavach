Write-Host "Starting KAVACH Ecosystem..." -ForegroundColor Cyan

Start-Process powershell -ArgumentList "-NoExit -Command `"cd c:\Users\Admin\Desktop\Kavach\backend; Write-Host '--- KAVACH BACKEND ---' -ForegroundColor Green; python -m uvicorn main:app --host 0.0.0.0 --port 8000`""
Start-Process powershell -ArgumentList "-NoExit -Command `"cd c:\Users\Admin\Desktop\Kavach\guardian-pwa; Write-Host '--- GUARDIAN PWA (Port 3000) ---' -ForegroundColor Yellow; npx -y serve dist -l 3000 -s`""
Start-Process powershell -ArgumentList "-NoExit -Command `"cd c:\Users\Admin\Desktop\Kavach\dashboard; Write-Host '--- POLICE DASHBOARD (Port 5174) ---' -ForegroundColor Blue; npm run dev -- --port 5174`""
Start-Process powershell -ArgumentList "-NoExit -Command `"cd c:\Users\Admin\Desktop\Kavach\call-bridge; Write-Host '--- WHATSAPP SERVER ---' -ForegroundColor Magenta; python whatsapp_server.py`""
Start-Process powershell -ArgumentList "-NoExit -Command `"cd c:\Users\Admin\Desktop\Kavach\call-bridge; Write-Host '--- AI OPERATOR (CALL BRIDGE) ---' -ForegroundColor Red; python ai_operator.py`""

Write-Host "All components launched in separate windows!" -ForegroundColor Green
