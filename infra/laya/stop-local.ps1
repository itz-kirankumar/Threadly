$ErrorActionPreference = "Stop"

$pidPath = Join-Path $PSScriptRoot "server.pid"
if (-not (Test-Path -LiteralPath $pidPath)) {
  Write-Output "No local Laya PID file was found."
  exit 0
}

$processId = [int](Get-Content -LiteralPath $pidPath -Raw).Trim()
$process = Get-Process -Id $processId -ErrorAction SilentlyContinue
if ($process) {
  Stop-Process -Id $processId
  Wait-Process -Id $processId -Timeout 10 -ErrorAction SilentlyContinue
}
Remove-Item -LiteralPath $pidPath -ErrorAction SilentlyContinue
Write-Output "Local Laya process stopped."
