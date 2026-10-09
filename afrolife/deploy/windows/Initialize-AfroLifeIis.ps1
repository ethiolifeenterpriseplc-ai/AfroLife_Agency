[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$UrlRewriteMsi,

  [Parameter(Mandatory = $true)]
  [string]$ArrMsi
)

$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script from an elevated PowerShell session.'
}

$operatingSystem = Get-CimInstance -ClassName Win32_OperatingSystem
$windowsVersion = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$isWindowsServer = $operatingSystem.ProductType -ne 1
$isWindows11 = $operatingSystem.Caption -match 'Windows 11'
if (-not ($isWindowsServer -or $isWindows11)) {
  throw "Unsupported host: $($operatingSystem.Caption). Use a supported Windows Server or Windows 11 host."
}

foreach ($installer in @($UrlRewriteMsi, $ArrMsi)) {
  if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    throw "Installer not found: $installer"
  }

  $signature = Get-AuthenticodeSignature -LiteralPath $installer
  if ($signature.Status -ne [Management.Automation.SignatureStatus]::Valid -or
      $signature.SignerCertificate.Subject -notmatch '(^|,\s*)O=Microsoft Corporation(,|$)') {
    throw "Installer must have a valid Microsoft Authenticode signature: $installer"
  }
}

$logDirectory = Join-Path $env:ProgramData 'AfroLife\logs\iis-setup'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

if ($isWindowsServer) {
  Import-Module ServerManager
  $featureResult = Install-WindowsFeature -Name @(
    'Web-Server',
    'Web-Default-Doc',
    'Web-Static-Content',
    'Web-Http-Errors',
    'Web-Http-Redirect',
    'Web-Http-Logging',
    'Web-Request-Monitor',
    'Web-Mgmt-Console',
    'Web-Scripting-Tools'
  ) -IncludeManagementTools
  if (-not $featureResult.Success) {
    throw 'Windows Server IIS feature installation failed.'
  }
  if ($featureResult.RestartNeeded -eq 'Yes') {
    throw 'Windows requires a restart to finish IIS setup. Restart, then run this script again.'
  }
} else {
  $features = @(
    'IIS-WebServerRole',
    'IIS-WebServer',
    'IIS-CommonHttpFeatures',
    'IIS-DefaultDocument',
    'IIS-StaticContent',
    'IIS-HttpErrors',
    'IIS-HttpRedirect',
    'IIS-HttpLogging',
    'IIS-RequestMonitor',
    'IIS-ManagementConsole',
    'IIS-ManagementScriptingTools'
  )
  $featureResult = Enable-WindowsOptionalFeature -Online -FeatureName $features -All -NoRestart
  if ($featureResult.RestartNeeded) {
    throw 'Windows requires a restart to finish IIS setup. Restart, then run this script again.'
  }
}

function Install-SignedMsi {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $logPath = Join-Path $logDirectory "$Name-install.log"
  $arguments = @(
    '/i',
    "`"$Path`"",
    '/qn',
    '/norestart',
    '/l*v',
    "`"$logPath`""
  )
  $process = Start-Process -FilePath 'msiexec.exe' -ArgumentList $arguments -Wait -PassThru
  if ($process.ExitCode -notin @(0, 3010)) {
    throw "$Name installation failed with exit code $($process.ExitCode). See $logPath"
  }
  if ($process.ExitCode -eq 3010) {
    throw "$Name installed, but Windows requires a restart. Restart, then run this script again."
  }
}

Install-SignedMsi -Path $UrlRewriteMsi -Name 'url-rewrite'
Install-SignedMsi -Path $ArrMsi -Name 'application-request-routing'

$appCmd = Join-Path $env:windir 'System32\inetsrv\appcmd.exe'
if (-not (Test-Path -LiteralPath $appCmd -PathType Leaf)) {
  throw 'IIS appcmd.exe is missing after feature installation.'
}

& $appCmd set config -section:system.webServer/proxy /enabled:true /commit:apphost
if ($LASTEXITCODE -ne 0) {
  throw 'Could not enable IIS ARR proxy mode.'
}

$webAdministration = Get-Module -ListAvailable -Name WebAdministration
if ($webAdministration) {
  Import-Module WebAdministration
  $defaultSite = Get-Website -Name 'Default Web Site' -ErrorAction SilentlyContinue
  if ($defaultSite -and $defaultSite.State -eq 'Started') {
    Stop-Website -Name 'Default Web Site'
  }
}

$iisInboundRules = @(
  'IIS-WebServerRole-HTTP-In-TCP',
  'IIS-WebServerRole-HTTPS-In-TCP',
  'IIS-WebServerRole-QUIC-In-UDP'
)
foreach ($ruleName in $iisInboundRules) {
  $rule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
  if ($rule -and $rule.Enabled) {
    Set-NetFirewallRule -Name $ruleName -Enabled False
  }
}

Write-Output "IIS and ARR prerequisites configured for $($operatingSystem.Caption) $($windowsVersion.DisplayVersion)."
Write-Output 'ARR proxy mode is enabled. The default IIS site is stopped, and IIS HTTP/HTTPS/QUIC inbound rules are disabled.'
Write-Output 'No production site was created and no inbound firewall access was opened.'
Write-Output "Setup logs: $logDirectory"
