$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$localEnvironment = Join-Path $env:LOCALAPPDATA 'AfroLife\afrolife.env'
$serviceEnvironmentRoot = Join-Path $env:LOCALAPPDATA 'AfroLife\services'
$serviceDefinitions = @(
  @{ Name = 'workforce-management'; Database = 'afrolife_worker_management'; Role = 'afrolife_worker'; Secret = 'WORKFORCE_MANAGEMENT_GATEWAY_SECRET'; DatabaseKey = 'WORKFORCE_MANAGEMENT_DATABASE_URL'; Port = 3400 },
  @{ Name = 'staffing'; Database = 'afrolife_staffing'; Role = 'afrolife_staffing'; Secret = 'STAFFING_GATEWAY_SECRET'; DatabaseKey = 'STAFFING_DATABASE_URL'; Port = 3401 },
  @{ Name = 'property-management'; Database = 'afrolife_property_management'; Role = 'afrolife_property'; Secret = 'PROPERTY_MANAGEMENT_GATEWAY_SECRET'; DatabaseKey = 'PROPERTY_MANAGEMENT_DATABASE_URL'; Port = 3402 },
  @{ Name = 'marketplace'; Database = 'afrolife_marketplace'; Role = 'afrolife_marketplace'; Secret = 'MARKETPLACE_GATEWAY_SECRET'; DatabaseKey = 'MARKETPLACE_DATABASE_URL'; Port = 3403 }
)

if (-not (Test-Path $localEnvironment)) {
  throw "Local AfroLife environment file not found: $localEnvironment. Set up the local database first."
}

$environment = @{}
foreach ($line in Get-Content $localEnvironment) {
  if ($line -match '^([^#=]+)=(.*)$') { $environment[$Matches[1]] = $Matches[2] }
}
if (-not $environment.ContainsKey('MIGRATION_DATABASE_URL')) {
  throw 'MIGRATION_DATABASE_URL is required in the local environment file.'
}

$sourceUri = [uri]$environment['MIGRATION_DATABASE_URL']
$sourceDatabase = $sourceUri.AbsolutePath.TrimStart('/')
if ($sourceUri.Host -notin @('127.0.0.1', 'localhost', '::1') -or $sourceUri.Port -ne 5433 -or $sourceDatabase -ne 'afrolife') {
  throw 'Refusing local provisioning: MIGRATION_DATABASE_URL must point to 127.0.0.1:5433/afrolife.'
}
if (-not $environment.ContainsKey('DATABASE_URL')) {
  throw 'DATABASE_URL is required so each local service can use the existing development runtime role.'
}

$postgresRoot = Join-Path $env:ProgramFiles 'PostgreSQL'
$postgresInstall = Get-ChildItem $postgresRoot -Directory -ErrorAction SilentlyContinue |
  Sort-Object { [version]("$($_.Name).0") } -Descending |
  Where-Object { Test-Path (Join-Path $_.FullName 'bin\psql.exe') } |
  Select-Object -First 1
if (-not $postgresInstall) { throw 'PostgreSQL command-line tools were not found.' }
$binDir = Join-Path $postgresInstall.FullName 'bin'
$psql = Join-Path $binDir 'psql.exe'
$createdb = Join-Path $binDir 'createdb.exe'
. (Join-Path $PSScriptRoot 'agency-domain-runtime-privileges.ps1')

$userInfo = [uri]::UnescapeDataString($sourceUri.UserInfo)
$separator = $userInfo.IndexOf(':')
if ($separator -lt 1) { throw 'MIGRATION_DATABASE_URL must include a PostgreSQL migration role and password.' }
$adminUser = $userInfo.Substring(0, $separator)
$adminPassword = $userInfo.Substring($separator + 1)

function New-RandomSecret {
  return (& node -p "require('node:crypto').randomBytes(48).toString('base64url')").Trim()
}

function Invoke-AdminSql([string]$Database, [string]$Sql) {
  & $psql -X -h 127.0.0.1 -p 5433 -U $adminUser -d $Database -w -v ON_ERROR_STOP=1 -c $Sql
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL command failed for database $Database." }
}

$env:PGPASSWORD = $adminPassword
try {
  $existing = & $psql -X -A -t -h 127.0.0.1 -p 5433 -U $adminUser -d postgres -w -v ON_ERROR_STOP=1 `
    -c "SELECT datname FROM pg_database WHERE datname IN ('afrolife_worker_management','afrolife_staffing','afrolife_property_management','afrolife_marketplace') ORDER BY datname"
  if ($LASTEXITCODE -ne 0) { throw 'Could not inspect local PostgreSQL database names.' }
  if ($existing) {
    throw "Refusing to overwrite existing local service databases: $($existing -join ', '). Remove or rename them only after reviewing their contents."
  }

  New-Item -ItemType Directory -Force -Path $serviceEnvironmentRoot | Out-Null
  $serviceConfigs = @()
  foreach ($service in $serviceDefinitions) {
    $password = New-RandomSecret
    $gatewaySecret = $environment[$service.Secret]
    if (-not $gatewaySecret -or $gatewaySecret.Length -lt 32) {
      $gatewaySecret = New-RandomSecret
      $environment[$service.Secret] = $gatewaySecret
    }
    $roleSql = "CREATE ROLE $($service.Role) LOGIN PASSWORD '$password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS"
    Invoke-AdminSql 'postgres' $roleSql
    & $createdb -h 127.0.0.1 -p 5433 -U $adminUser -w -O $adminUser $service.Database
    if ($LASTEXITCODE -ne 0) { throw "Could not create local database $($service.Database)." }

    $serviceDatabaseUri = "postgresql://$($service.Role):$password@127.0.0.1:5433/$($service.Database)"
    $migrationUri = "postgresql://$($sourceUri.UserInfo)@127.0.0.1:5433/$($service.Database)"
    $environmentPath = Join-Path $serviceEnvironmentRoot "$($service.Name).env"
    $serviceStoragePath = Join-Path $serviceEnvironmentRoot "$($service.Name)\files"
    New-Item -ItemType Directory -Force -Path $serviceStoragePath | Out-Null
    $serviceLines = @(
      'NODE_ENV=development',
      "HOST=127.0.0.1",
      "PORT=$($service.Port)",
      "$($service.DatabaseKey)=$serviceDatabaseUri",
      "$($service.Secret)=$gatewaySecret",
      "FILE_STORAGE_DIR=$serviceStoragePath"
    )
    [System.IO.File]::WriteAllText($environmentPath, [string]::Join([Environment]::NewLine, $serviceLines) + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
    $serviceConfigs += @{
      Name = $service.Name
      Database = $service.Database
      Environment = $environmentPath
      DatabaseUrl = $serviceDatabaseUri
      MigrationUrl = $migrationUri
    }
  }

  foreach ($config in $serviceConfigs) {
    $service = $serviceDefinitions | Where-Object { $_.Name -eq $config.Name } | Select-Object -First 1
    $serviceDatabaseUri = "postgresql://$($service.Role):$password@127.0.0.1:5433/$($service.Database)"
    $migrationUri = "postgresql://$($sourceUri.UserInfo)@127.0.0.1:5433/$($service.Database)"
    $previousDatabaseUrl = $env:DATABASE_URL
    $previousMigrationUrl = $env:MIGRATION_DATABASE_URL
    $previousEnvironmentFile = $env:AFROLIFE_ENV_FILE
    try {
      $env:DATABASE_URL = $config.DatabaseUrl
      $env:MIGRATION_DATABASE_URL = $config.MigrationUrl
      $env:AFROLIFE_ENV_FILE = $config.Environment
      Push-Location $projectRoot
      try {
        & npm.cmd run db:migrate
        if ($LASTEXITCODE -ne 0) { throw "Application schema migrations failed for $($config.Name)." }
      } finally {
        Pop-Location
      }
      Set-AgencyDomainRuntimePrivileges $service.Database $service.Role $service.Name
      Write-Output "Initialized the local $($config.Name) database schema."
    } finally {
      if ($null -eq $previousDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue } else { $env:DATABASE_URL = $previousDatabaseUrl }
      if ($null -eq $previousMigrationUrl) { Remove-Item Env:MIGRATION_DATABASE_URL -ErrorAction SilentlyContinue } else { $env:MIGRATION_DATABASE_URL = $previousMigrationUrl }
      if ($null -eq $previousEnvironmentFile) { Remove-Item Env:AFROLIFE_ENV_FILE -ErrorAction SilentlyContinue } else { $env:AFROLIFE_ENV_FILE = $previousEnvironmentFile }
    }
  }

  $updatedEnvironment = @()
  foreach ($line in Get-Content $localEnvironment) {
    if ($line -match '^([^#=]+)=') {
      $key = $Matches[1]
      if ($key -in @('WORKER_MANAGEMENT_GATEWAY_SECRET','STAFFING_GATEWAY_SECRET','PROPERTY_MANAGEMENT_GATEWAY_SECRET','MARKETPLACE_GATEWAY_SECRET')) { continue }
    }
    $updatedEnvironment += $line
  }
  foreach ($key in @('WORKER_MANAGEMENT_GATEWAY_SECRET','STAFFING_GATEWAY_SECRET','PROPERTY_MANAGEMENT_GATEWAY_SECRET','MARKETPLACE_GATEWAY_SECRET')) {
    $updatedEnvironment += "$key=$($environment[$key])"
  }
  [System.IO.File]::WriteAllText($localEnvironment, [string]::Join([Environment]::NewLine, $updatedEnvironment) + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
  Write-Output "Created four local service environments under $serviceEnvironmentRoot."
  Write-Output 'No service URLs were added to the central API environment; traffic remains on the legacy-compatible path.'
  Write-Output 'The databases contain migrated application schemas but no service records yet. Do not start service routing until the data-copy and compatibility gates pass.'
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
