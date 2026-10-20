$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = if ($env:AFROLIFE_ENV_FILE) {
  $env:AFROLIFE_ENV_FILE
} else {
  Join-Path $env:LOCALAPPDATA 'AfroLife\afrolife.env'
}

if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
  throw "Local AfroLife environment file not found: $envPath"
}

$accountingConfig = @{}
foreach ($line in Get-Content -LiteralPath $envPath) {
  if ($line -match '^\s*(ACCOUNTING_[A-Z0-9_]+)\s*=(.*)$') {
    $accountingConfig[$Matches[1]] = $Matches[2]
  }
}
foreach ($key in @('ACCOUNTING_DATABASE_URL', 'ACCOUNTING_GATEWAY_SECRET', 'ACCOUNTING_INGEST_SECRETS', 'ACCOUNTING_AUTH_MODE', 'ACCOUNTING_SERVICE_URL')) {
  if (-not $accountingConfig.ContainsKey($key)) {
    throw "Missing $key. Run 'npm run db:accounting:local:setup' first."
  }
}
if ($accountingConfig.ACCOUNTING_AUTH_MODE -ne 'gateway' -or $accountingConfig.ACCOUNTING_SERVICE_URL -ne 'http://127.0.0.1:3301') {
  throw 'Local Accounting settings do not match the integrated local gateway configuration.'
}

Push-Location $projectRoot
try {
  $env:ACCOUNTING_DATABASE_URL = $accountingConfig.ACCOUNTING_DATABASE_URL
  $env:ACCOUNTING_GATEWAY_SECRET = $accountingConfig.ACCOUNTING_GATEWAY_SECRET
  $env:ACCOUNTING_INGEST_SECRETS = $accountingConfig.ACCOUNTING_INGEST_SECRETS
  $env:ACCOUNTING_AUTH_MODE = $accountingConfig.ACCOUNTING_AUTH_MODE
  $env:HOST = '127.0.0.1'
  $env:PORT = '3301'
  & node dist\services\accounting\server.js
  if ($LASTEXITCODE -ne 0) { throw "Accounting service exited with code $LASTEXITCODE." }
} finally {
  Pop-Location
}
