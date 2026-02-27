param(
  [int[]]$Ports = @(5173, 8787)
)

$entries = Get-NetTCPConnection -LocalPort $Ports -ErrorAction SilentlyContinue
if (-not $entries) {
  Write-Output "No listeners found on ports: $($Ports -join ', ')"
  exit 0
}

$processIds = $entries |
  Select-Object -ExpandProperty OwningProcess -Unique |
  Where-Object { $_ -gt 0 }

if (-not $processIds) {
  Write-Output "No stoppable processes found on ports: $($Ports -join ', ')"
  exit 0
}

foreach ($procId in $processIds) {
  taskkill /PID $procId /F 1>$null 2>$null
}

Start-Sleep -Seconds 1
Write-Output "Cleared listeners on ports: $($Ports -join ', ')"
exit 0
