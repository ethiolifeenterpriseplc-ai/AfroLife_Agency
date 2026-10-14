$ErrorActionPreference = 'Stop'
$stateRoot = Join-Path $env:LOCALAPPDATA 'AfroLife\android-lan-preview'
$pidPath = Join-Path $stateRoot 'proxy.pid'
$ruleName = 'EthioLife Android LAN preview HTTPS'
if (Test-Path -LiteralPath $pidPath) {
  $proxyPid = [int](Get-Content -LiteralPath $pidPath -Raw)
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$proxyPid" -ErrorAction SilentlyContinue
  if ($process -and $process.CommandLine -like '*local-android-lan-proxy.mjs*') {
    Stop-Process -Id $proxyPid -Force
  }
  Remove-Item -LiteralPath $pidPath -Force
}
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Write-Output 'EthioLife Android LAN preview stopped and its temporary firewall rule removed.'
