$ErrorActionPreference = 'Stop'

$localEnvironment = Join-Path $env:LOCALAPPDATA 'AfroLife\afrolife.env'
if (-not (Test-Path $localEnvironment)) {
  throw "Local AfroLife environment file not found: $localEnvironment."
}
$environment = @{}
foreach ($line in Get-Content $localEnvironment) {
  if ($line -match '^([^#=]+)=(.*)$') { $environment[$Matches[1]] = $Matches[2] }
}
if (-not $environment.ContainsKey('MIGRATION_DATABASE_URL')) {
  throw 'MIGRATION_DATABASE_URL is required in the local environment file.'
}
$sourceUri = [uri]$environment['MIGRATION_DATABASE_URL']
if ($sourceUri.Scheme -notin @('postgres', 'postgresql') -or
    $sourceUri.Host -notin @('127.0.0.1', 'localhost', '::1') -or
    $sourceUri.Port -ne 5433 -or $sourceUri.AbsolutePath.TrimStart('/') -ne 'afrolife') {
  throw 'Refusing to alter roles: MIGRATION_DATABASE_URL must point to local 127.0.0.1:5433/afrolife.'
}
$userInfo = [uri]::UnescapeDataString($sourceUri.UserInfo)
$separator = $userInfo.IndexOf(':')
if ($separator -lt 1) { throw 'MIGRATION_DATABASE_URL must include a local migration role and password.' }
$adminUser = $userInfo.Substring(0, $separator)
$adminPassword = $userInfo.Substring($separator + 1)

$postgresRoot = Join-Path $env:ProgramFiles 'PostgreSQL'
$postgresInstall = Get-ChildItem $postgresRoot -Directory -ErrorAction SilentlyContinue |
  Sort-Object { [version]("$($_.Name).0") } -Descending |
  Where-Object { Test-Path (Join-Path $_.FullName 'bin\psql.exe') } |
  Select-Object -First 1
if (-not $postgresInstall) { throw 'PostgreSQL command-line tools were not found.' }
$psql = Join-Path $postgresInstall.FullName 'bin\psql.exe'
. (Join-Path $PSScriptRoot 'agency-domain-runtime-privileges.ps1')

$services = @(
  @{ Domain = 'workforce-management'; Database = 'afrolife_worker_management'; Role = 'afrolife_worker' },
  @{ Domain = 'staffing'; Database = 'afrolife_staffing'; Role = 'afrolife_staffing' },
  @{ Domain = 'property-management'; Database = 'afrolife_property_management'; Role = 'afrolife_property' },
  @{ Domain = 'marketplace'; Database = 'afrolife_marketplace'; Role = 'afrolife_marketplace' }
)
$env:PGPASSWORD = $adminPassword
try {
  foreach ($service in $services) {
    $exists = & $psql -X -A -t -h 127.0.0.1 -p 5433 -U $adminUser -d postgres -w -v ON_ERROR_STOP=1 `
      -c "SELECT count(*) FROM pg_database WHERE datname='$($service.Database)'"
    if ($LASTEXITCODE -ne 0 -or $exists.Trim() -ne '1') {
      throw "Expected isolated local database $($service.Database) does not exist; no database was created."
    }
    Set-AgencyDomainRuntimePrivileges $service.Database $service.Role $service.Domain
  }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
