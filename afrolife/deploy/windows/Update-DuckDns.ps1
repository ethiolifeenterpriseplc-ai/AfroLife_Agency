param(
  [string]$Ip
)

$ErrorActionPreference = 'Stop'

$credentialPath = Join-Path $env:LOCALAPPDATA 'AfroLife\duckdns-credential.json'
$logDirectory = Join-Path $env:LOCALAPPDATA 'AfroLife\logs'
$logPath = Join-Path $logDirectory 'duckdns-update.log'
if (-not (Test-Path -LiteralPath $credentialPath)) {
  throw "DuckDNS credential file not found: $credentialPath"
}
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

$credential = Get-Content -LiteralPath $credentialPath -Raw | ConvertFrom-Json
if ($credential.domain -notmatch '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$') {
  throw 'DuckDNS credential file contains an invalid domain label.'
}

$ipQuery = '&ip='
if (-not [string]::IsNullOrWhiteSpace($Ip)) {
  $parsedAddress = $null
  if (-not [Net.IPAddress]::TryParse($Ip, [ref]$parsedAddress) -or
      $parsedAddress.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) {
    throw 'The optional -Ip value must be a valid IPv4 address.'
  }
  $ipQuery = '&ip=' + [Uri]::EscapeDataString($parsedAddress.ToString())
}

$secureToken = ConvertTo-SecureString -String $credential.token
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
  $tokenValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
  $encodedDomain = [Uri]::EscapeDataString([string]$credential.domain)
  $encodedToken = [Uri]::EscapeDataString($tokenValue)
  $uri = "https://www.duckdns.org/update?domains=$encodedDomain&token=$encodedToken$ipQuery"
  try {
    $result = (Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec 20).ToString().Trim()
  } catch {
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) DuckDNS HTTPS request failed."
    throw 'DuckDNS HTTPS request failed. Check outbound HTTPS connectivity without exposing the token.'
  }
} finally {
  if ($tokenPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
  }
  $tokenValue = $null
  $uri = $null
}

if ($result -ne 'OK') {
  $line = "$(Get-Date -Format o) DuckDNS update failed (response was not OK)."
  Add-Content -LiteralPath $logPath -Value $line
  throw 'DuckDNS did not confirm the DNS update. Check the account, domain claim, and outbound HTTPS access.'
}

Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) DuckDNS update succeeded."
