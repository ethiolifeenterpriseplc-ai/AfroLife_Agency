[CmdletBinding()]
param(
  [string]$Distro = 'Ubuntu'
)

$ErrorActionPreference = 'Stop'
$failed = $false

function Write-Check {
  param(
    [string]$Name,
    [bool]$Passed,
    [string]$Details
  )

  $status = if ($Passed) { 'PASS' } else { 'FAIL' }
  Write-Output "[$status] $Name - $Details"
  if (-not $Passed) {
    $script:failed = $true
  }
}

$nodeVersion = $null
try {
  $nodeVersion = (& node --version 2>$null).Trim()
} catch {
  $nodeVersion = $null
}
$nodeMajor = if ($nodeVersion -match '^v(\d+)\.') { [int]$Matches[1] } else { 0 }
$nodeDetails = if ($nodeVersion) { $nodeVersion } else { 'Node.js was not found' }
Write-Check -Name 'Node.js runtime' -Passed ($nodeMajor -ge 22) -Details $nodeDetails

$projectRoot = Split-Path -Parent $PSScriptRoot
$packageLock = Test-Path -LiteralPath (Join-Path $projectRoot 'package-lock.json') -PathType Leaf
Write-Check -Name 'Reproducible dependency lock' -Passed $packageLock -Details 'package-lock.json is present'

$guestCommand = 'systemctl is-active afrolife nginx postgresql; ss -H -lnt'
$guestResult = & wsl.exe --distribution $Distro --exec bash -lc $guestCommand 2>&1
$guestExitCode = $LASTEXITCODE
$guestLines = @($guestResult | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
$serviceStates = @($guestLines | Select-Object -First 3)
$listenerLines = @($guestLines | Where-Object { $_ -match '^LISTEN\s' })
$bindingsSafe = $true
foreach ($port in 3000, 5432, 8080) {
  $portBindings = @($listenerLines | ForEach-Object { ($_ -split '\s+')[3] } | Where-Object { $_ -match ":$port$" })
  if ($portBindings.Count -ne 1 -or $portBindings[0] -ne "127.0.0.1:$port") {
    $bindingsSafe = $false
  }
}
$servicesActive = $serviceStates.Count -eq 3 -and @($serviceStates | Where-Object { $_ -ne 'active' }).Count -eq 0
$guestReady = $guestExitCode -eq 0 -and $servicesActive -and $bindingsSafe
$guestDetails = "services=$($serviceStates -join ','); bindings=$($listenerLines.Count) listeners; API, DB, and proxy must bind only to IPv4 loopback"
Write-Check -Name "WSL $Distro services and bind addresses" -Passed $guestReady -Details $guestDetails

$healthBody = & curl.exe --silent --show-error --fail --max-time 5 'http://127.0.0.1:3000/healthz' 2>$null
$healthExitCode = $LASTEXITCODE
$healthReady = $false
if ($healthExitCode -eq 0) {
  try {
    $health = $healthBody | ConvertFrom-Json
    $healthReady = $health.ok -eq $true -and $health.database -eq 'connected'
  } catch {
    $healthReady = $false
  }
}
Write-Check -Name 'Local API and database health' -Passed $healthReady -Details '127.0.0.1:3000/healthz must report ok=true and database=connected'

$servedHtml = (& curl.exe --silent --show-error --fail --max-time 5 'http://127.0.0.1:8080/' 2>$null) -join "`n"
$servedExitCode = $LASTEXITCODE
$sourceHtml = Get-Content -LiteralPath (Join-Path $projectRoot 'public\index.html') -Raw
$expectedBrand = [regex]::Match($sourceHtml, '<title>([^|<]+)\|').Groups[1].Value.Trim()
$currentReleaseServed = $servedExitCode -eq 0 -and $expectedBrand -and $servedHtml.Contains("<title>$expectedBrand |")
Write-Check -Name 'Local proxy serves this workspace release' -Passed ([bool]$currentReleaseServed) -Details "127.0.0.1:8080 must serve the current app brand: $expectedBrand"

if ($failed) {
  Write-Error 'Local deployment readiness checks failed. Do not treat this environment as production-ready.'
  exit 1
}

Write-Output 'Local deployment readiness checks passed. This confirms local health only; it does not certify public reachability, TLS, regulatory readiness, or production approval.'
