param(
  [string]$Domain = 'afrolife-agency'
)

$ErrorActionPreference = 'Stop'

$normalizedDomain = $Domain.Trim().ToLowerInvariant()
if ($normalizedDomain.EndsWith('.duckdns.org')) {
  $normalizedDomain = $normalizedDomain.Substring(0, $normalizedDomain.Length - '.duckdns.org'.Length)
}
if ($normalizedDomain -notmatch '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$') {
  throw 'Enter only the DuckDNS subdomain label (for example, afrolife-agency).'
}

$token = Read-Host 'DuckDNS account token (input is hidden)' -AsSecureString
if ($token.Length -lt 20) {
  throw 'The DuckDNS token appears too short; no credential file was written.'
}

$credentialPath = Join-Path $env:LOCALAPPDATA 'AfroLife\duckdns-credential.json'
$credentialDirectory = Split-Path -Parent $credentialPath
New-Item -ItemType Directory -Force -Path $credentialDirectory | Out-Null

$credential = [ordered]@{
  domain = $normalizedDomain
  token = ConvertFrom-SecureString -SecureString $token
}
$json = $credential | ConvertTo-Json
[System.IO.File]::WriteAllText(
  $credentialPath,
  $json,
  [System.Text.UTF8Encoding]::new($false)
)

$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = [System.Security.AccessControl.FileSecurity]::new()
$acl.SetAccessRuleProtection($true, $false)
$acl.SetOwner($currentSid)
foreach ($sid in @($currentSid)) {
  $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
    $sid,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $credentialPath -AclObject $acl

Write-Output "DuckDNS credential saved with current-user DPAPI protection: $credentialPath"
Write-Output 'Run Update-DuckDns.ps1 and its scheduled task as this same Windows account.'

