$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$python = Join-Path $PSScriptRoot ".venv/Scripts/python.exe"
$secretPath = Join-Path $PSScriptRoot "secrets/api-key"
$pidPath = Join-Path $PSScriptRoot "server.pid"
$logPath = Join-Path $PSScriptRoot "server.log"
$errorLogPath = Join-Path $PSScriptRoot "server-error.log"

if (-not (Test-Path -LiteralPath $python)) {
  throw "Laya is not installed in infra/laya/.venv. Run the installation step in docs/decision-model-services.md first."
}
if (-not (Test-Path -LiteralPath $secretPath)) {
  throw "Create infra/laya/secrets/api-key and set the same value as LAYA_API_KEY in .env.local first."
}
if (Test-Path -LiteralPath $pidPath) {
  $existingPid = [int](Get-Content -LiteralPath $pidPath -Raw).Trim()
  if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) {
    throw "A Laya process is already running (PID $existingPid). Stop it with infra/laya/stop-local.ps1 first."
  }
  Remove-Item -LiteralPath $pidPath
}
if (Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue) {
  throw "Port 8000 is already in use; Laya was not started."
}

$env:LAYA_HOST = "127.0.0.1"
$env:LAYA_PORT = "8000"
$env:LAYA_API_KEY = [IO.File]::ReadAllText($secretPath).Trim()
$env:LAYA_DEVICE = "cpu"
$env:LAYA_PRELOAD = "0"
$env:LAYA_MODELS = "english,multilingual"
$env:LAYA_DEFAULT_MODEL = "english"
$env:LAYA_MAX_LOADED = "1"
$env:LAYA_THREADS = "2"
$env:OMP_NUM_THREADS = "2"

$process = Start-Process -FilePath $python -ArgumentList @("-m", "laya.serve") `
  -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput $logPath -RedirectStandardError $errorLogPath
Set-Content -LiteralPath $pidPath -Value $process.Id -NoNewline
Start-Sleep -Seconds 2
if (-not (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {
  Remove-Item -LiteralPath $pidPath -ErrorAction SilentlyContinue
  throw "Laya failed to start. Check infra/laya/server-error.log."
}
Write-Output "Laya started locally (PID $($process.Id)); wait for /health to respond before using qualification."
