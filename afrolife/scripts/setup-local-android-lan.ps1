param([string]$InterfaceAlias = '')

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$artifactRoot = Join-Path $projectRoot 'artifacts'
$stateRoot = Join-Path $env:LOCALAPPDATA 'AfroLife\android-lan-preview'
$ruleName = 'EthioLife Android LAN preview HTTPS'
$port = 8443
$upstreamPort = 3000

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this setup from an elevated PowerShell window (Run as administrator). Windows requires administrator rights to add the Wi-Fi-only inbound firewall rule.'
}

if (-not $InterfaceAlias) {
  $address = Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred |
    Where-Object { $_.InterfaceAlias -match 'Wi-?Fi|Wireless' -and $_.IPAddress -notmatch '^(127|169\.254)\.' } |
    Select-Object -First 1
} else {
  $address = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias $InterfaceAlias -AddressState Preferred |
    Where-Object { $_.IPAddress -notmatch '^(127|169\.254)\.' } |
    Select-Object -First 1
}
if (-not $address) { throw 'No active Wi-Fi IPv4 address was found. Connect this PC to the Wi-Fi used by the Android device and retry.' }

$ip = [System.Net.IPAddress]::Parse($address.IPAddress)
$prefix = [int]$address.PrefixLength
if ($prefix -lt 1 -or $prefix -gt 30) { throw "Refusing an unusually broad or point-to-point Wi-Fi subnet: /$prefix" }
$octets = $address.IPAddress.Split('.') | ForEach-Object { [int]$_ }
$maskValue = [uint32]::MaxValue -shl (32 - $prefix)
$maskOctets = @((($maskValue -shr 24) -band 255), (($maskValue -shr 16) -band 255), (($maskValue -shr 8) -band 255), ($maskValue -band 255))
$networkOctets = for ($i = 0; $i -lt 4; $i++) { $octets[$i] -band $maskOctets[$i] }
$subnet = "$($networkOctets -join '.')/$prefix"

$health = Invoke-RestMethod -Uri "http://127.0.0.1:$upstreamPort/healthz" -TimeoutSec 5
if (-not $health.ok -or $health.database -ne 'connected') { throw 'The local API/database health check failed.' }
$preflight = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$upstreamPort/api/v1/auth/login")
$preflight.Method = 'OPTIONS'
$preflight.Timeout = 5000
$preflight.Headers.Add('Origin', 'https://localhost')
$preflight.Headers.Add('Access-Control-Request-Method', 'POST')
$preflight.Headers.Add('Access-Control-Request-Headers', 'content-type')
$preflightResponse = $preflight.GetResponse()
try {
  if ([int]$preflightResponse.StatusCode -ne 204) { throw 'The API does not allow the native Android WebView origin https://localhost.' }
} finally { $preflightResponse.Dispose() }

New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
$certPath = Join-Path $stateRoot 'lan-preview.cer'
$pfxPath = Join-Path $stateRoot 'lan-preview.pfx'
$pfxPasswordPath = Join-Path $stateRoot 'lan-preview-pfx-password.txt'
$pidPath = Join-Path $stateRoot 'proxy.pid'

$certificate = New-SelfSignedCertificate -Type Custom -Subject "CN=$($address.IPAddress)" `
  -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 2048 `
  -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment,CertSign `
  -NotAfter (Get-Date).AddDays(45) `
  -TextExtension @(
    '2.5.29.19={critical}{text}ca=1&pathlength=0',
    "2.5.29.17={text}IPAddress=$($address.IPAddress)",
    '2.5.29.37={text}1.3.6.1.5.5.7.3.1'
  )
try {
  [System.IO.File]::WriteAllBytes($certPath, $certificate.RawData)
  $pfxPassword = [guid]::NewGuid().ToString('N')
  [System.IO.File]::WriteAllText($pfxPasswordPath, $pfxPassword, [System.Text.Encoding]::ASCII)
  Export-PfxCertificate -Cert $certificate -FilePath $pfxPath `
    -Password (ConvertTo-SecureString -String $pfxPassword -AsPlainText -Force) | Out-Null
  Copy-Item -LiteralPath $certPath -Destination (Join-Path $artifactRoot 'EthioLife-LAN-Preview-CA.cer') -Force
} finally {
  Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($certificate.Thumbprint)" -ErrorAction SilentlyContinue
}

$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) { $existing | Remove-NetFirewallRule }
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP `
  -LocalAddress $address.IPAddress -LocalPort $port -RemoteAddress $subnet -Profile Any | Out-Null

if (Test-Path -LiteralPath $pidPath) {
  $oldPid = [int](Get-Content -LiteralPath $pidPath -Raw)
  $old = Get-CimInstance Win32_Process -Filter "ProcessId=$oldPid" -ErrorAction SilentlyContinue
  if ($old -and $old.CommandLine -like '*local-android-lan-proxy.mjs*') { Stop-Process -Id $oldPid -Force }
  Remove-Item -LiteralPath $pidPath -Force
}

$env:AFROLIFE_LAN_HOST = $address.IPAddress
$env:AFROLIFE_LAN_SUBNET = $subnet
$env:AFROLIFE_LAN_PORT = "$port"
$env:AFROLIFE_LAN_PFX = $pfxPath
$env:AFROLIFE_LAN_PFX_PASSWORD = [System.IO.File]::ReadAllText($pfxPasswordPath)
$env:AFROLIFE_LAN_UPSTREAM_PORT = "$upstreamPort"
$node = (Get-Command node.exe -ErrorAction Stop).Source
$stdout = Join-Path $stateRoot 'proxy.log'
$stderr = Join-Path $stateRoot 'proxy-error.log'
$process = Start-Process -FilePath $node -ArgumentList 'scripts/local-android-lan-proxy.mjs' `
  -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput $stdout -RedirectStandardError $stderr
Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding ascii

Start-Sleep -Seconds 2
if (-not (Get-NetTCPConnection -State Listen -LocalAddress $address.IPAddress -LocalPort $port -ErrorAction SilentlyContinue)) {
  $message = if (Test-Path -LiteralPath $stderr) { Get-Content -LiteralPath $stderr -Raw } else { 'No proxy listener was created.' }
  throw "HTTPS LAN proxy failed to start: $message"
}

Write-Output "LAN preview ready: https://$($address.IPAddress):$port"
Write-Output "Allowed clients: $subnet on $($address.InterfaceAlias)"
Write-Output 'On Android, install artifacts/EthioLife-LAN-Preview-CA.cer as a CA certificate, then set the app API server address to the HTTPS URL above.'
Write-Output 'This debug-only preview exposes only /api/v1 and /healthz and forwards to the existing loopback API.'
