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

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$currentUserAce = "*$($currentUser.Value):(F)"
& icacls.exe $envPath /inheritance:r /grant:r $currentUserAce '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Could not restrict access to the local AfroLife environment file; Insurance secrets were not written.'
}

Push-Location $projectRoot
try {
  & node scripts\provision-local-insurance.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Local Insurance database provisioning failed.' }
  & npm.cmd run migrate:insurance
  if ($LASTEXITCODE -ne 0) { throw 'Local Insurance database migrations failed.' }
} finally {
  Pop-Location
}
