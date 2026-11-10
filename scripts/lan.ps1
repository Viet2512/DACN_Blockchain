param([switch]$Firewall)
$ErrorActionPreference = 'Stop'

$connections = @(Get-NetIPConfiguration | Where-Object {
    $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' -and $_.NetAdapter.HardwareInterface
})
if ($connections.Count -ne 1) { throw 'Expected one active Windows Wi-Fi/Ethernet gateway. Select the correct LAN IPv4 manually in PUBLIC_BASE_URL.' }
$network = $connections[0]
$addresses = @($network.IPv4Address | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' })
if ($addresses.Count -ne 1) { throw 'Expected one LAN IPv4 address; do not use a Docker/WSL bridge address.' }
$origin = 'http://{0}:3001' -f $addresses[0].IPAddress

if ($Firewall) {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run PowerShell as Administrator to configure the scoped firewall rules.' }
    if ((Get-NetConnectionProfile -InterfaceIndex $network.InterfaceIndex).NetworkCategory -ne 'Private') {
        throw 'This network is not Private. Keep Public on shared Wi-Fi; use a trusted private Wi-Fi for the demo. This script never changes network trust.'
    }
}

if ($Firewall) {
    if (-not (Get-NetFirewallRule -Name 'TraceChain-LAN-Web' -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name 'TraceChain-LAN-Web' -DisplayName 'TraceChain frontend LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3001 -Profile Private -RemoteAddress LocalSubnet | Out-Null
    }
    if (-not (Get-NetFirewallRule -Name 'TraceChain-LAN-Internal' -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name 'TraceChain-LAN-Internal' -DisplayName 'TraceChain internal ports blocked from LAN' -Direction Inbound -Action Block -Protocol TCP -LocalPort 3307,8080,7050,7051,7053,7054,8054,9051,9054,9443,9444,9445,11051,11054,17054,18054,19054 -Profile Private -RemoteAddress LocalSubnet | Out-Null
    }
    # WSL mirrored networking has its own inbound firewall; never set its default action to Allow.
    if (Get-Command Get-NetFirewallHyperVVMSetting -ErrorAction SilentlyContinue) {
        $creator = '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}'
        $vm = Get-NetFirewallHyperVVMSetting -PolicyStore ActiveStore -Name $creator -ErrorAction SilentlyContinue
        if ($vm -and -not (Get-NetFirewallHyperVRule -Name 'TraceChain-LAN-Web-WSL' -ErrorAction SilentlyContinue)) {
            New-NetFirewallHyperVRule -Name 'TraceChain-LAN-Web-WSL' -DisplayName 'TraceChain frontend WSL LAN' -VMCreatorId $creator -Direction Inbound -Action Allow -Protocol TCP -LocalPorts 3001 -Profiles Private -RemoteAddresses LocalSubnet | Out-Null
        }
        if ($vm -and -not (Get-NetFirewallHyperVRule -Name 'TraceChain-LAN-Internal-WSL' -ErrorAction SilentlyContinue)) {
            New-NetFirewallHyperVRule -Name 'TraceChain-LAN-Internal-WSL' -DisplayName 'TraceChain internal WSL ports blocked from LAN' -VMCreatorId $creator -Direction Inbound -Action Block -Protocol TCP -LocalPorts 3307,8080,7050,7051,7053,7054,8054,9051,9054,9443,9444,9445,11051,11054,17054,18054,19054 -Profiles Private -RemoteAddresses LocalSubnet | Out-Null
        }
    }
}
Write-Output ('Windows LAN: {0}; profile: {1}' -f $network.InterfaceAlias, $network.NetProfile.NetworkCategory)
Write-Output ('PUBLIC_BASE_URL=' + $origin)
Write-Output 'Set this value in the private root .env; keep all database/account credentials unchanged.'
Write-Output 'Apply with WSL: docker compose -f docker-compose.yml -f docker-compose.fabric.yml up -d --no-deps --wait backend'
