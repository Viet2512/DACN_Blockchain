$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'lan.ps1'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($script, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$rules = @($ast.FindAll({param($node)
    $node -is [Management.Automation.Language.CommandAst] -and $node.GetCommandName() -match '^New-NetFirewall(HyperV)?Rule$'
}, $true))
if ($rules.Count -ne 4) { throw 'Expected only the frontend allow and internal-port block rules for Windows/WSL.' }
foreach ($rule in $rules) {
    if ($rule.Extent.Text -notmatch '-Profiles? Private' -or $rule.Extent.Text -notmatch '-RemoteAddress(es)? LocalSubnet' -or $rule.Extent.Text -notmatch '-Protocol TCP') { throw 'A rule must be TCP, Private and LocalSubnet only.' }
    if ($rule.Extent.Text -match '-Action Allow' -and $rule.Extent.Text -notmatch '-LocalPorts? 3001 ') { throw 'Only the frontend port may be allowed.' }
}
$environmentFile = Join-Path $PSScriptRoot '../.env'
$before = (Get-FileHash $environmentFile).Hash
$output = & $script
if (-not ($output -match '^PUBLIC_BASE_URL=http://\d+\.\d+\.\d+\.\d+:3001$')) { throw 'No detected Windows LAN origin.' }
if ((Get-FileHash $environmentFile).Hash -ne $before) { throw 'Read-only LAN detection changed private configuration.' }
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $blocked = $false
    try { & $script -Firewall } catch { $blocked = $_.Exception.Message -match 'Administrator' }
    if (-not $blocked) { throw 'Firewall mutation must refuse a non-administrator.' }
}
Write-Output 'PASS: LAN detection, configuration preservation, scoped rule definitions and administrator guard. No firewall rule was applied.'
