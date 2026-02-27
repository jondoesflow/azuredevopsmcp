Set-StrictMode -Version Latest

Write-Output 'Starting external onboarding API (clean)...'
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'api:external-onboarding:clean' -WorkingDirectory (Get-Location)

Start-Sleep -Seconds 2

Write-Output 'Starting Vite dev server (clean)...'
npm run dev:clean
