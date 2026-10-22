# OmniBeat-MCP demo stopper for the no-Docker path (Windows / native
# PowerShell): stops whatever listens on the four demo ports. Guarded and
# idempotent -- a port with no listener is a no-op, and the script exits 0
# either way.
#
# Parity spec: scripts/demo-down.sh, which uses `fuser -k <port>/tcp`.
# The Windows equivalent: find the listening process via
# Get-NetTCPConnection (built into Windows 8+ / PowerShell 5.1) and stop
# it with Stop-Process. If Get-NetTCPConnection is unavailable, fall back
# to parsing `netstat -ano`. Note the listener on :3000 is the Next.js
# node.exe process itself (not the npm wrapper), so stopping the owning
# process frees the port, exactly like fuser -k.
#
# PowerShell 5.1 compatible (the version Windows ships by default).

$ErrorActionPreference = "Continue"

function Get-PortOrDefault {
    param([string]$EnvName, [int]$Default)
    $val = [Environment]::GetEnvironmentVariable($EnvName)
    $parsed = 0
    if ($val -and [int]::TryParse($val, [ref]$parsed)) { return $parsed }
    return $Default
}

function Get-ListenerProcessIds {
    param([int]$Port)
    $ids = @()
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
        foreach ($conn in $conns) {
            if ($conn.OwningProcess -gt 4) { $ids += [int]$conn.OwningProcess }
        }
    } catch {
        # Fallback: netstat -ano, LISTENING lines for this exact port.
        $pattern = ":$Port\s"
        $lines = & netstat -ano -p TCP 2>$null
        foreach ($line in $lines) {
            if ($line -match $pattern -and $line -match "LISTENING\s+(\d+)\s*$") {
                $found = [int]$Matches[1]
                if ($found -gt 4) { $ids += $found }
            }
        }
    }
    return @($ids | Select-Object -Unique)
}

$ports = @(
    (Get-PortOrDefault "OMNIBEAT_SIM_PORT" 3000),
    (Get-PortOrDefault "OMNIBEAT_ORCH_PORT" 4000),
    (Get-PortOrDefault "OMNIBEAT_MCP_PORT" 8080),
    (Get-PortOrDefault "OMNIBEAT_CHAOS_PORT" 9000)
)

foreach ($port in $ports) {
    $procIds = Get-ListenerProcessIds $port
    if ($procIds.Count -eq 0) {
        Write-Host ":$port not running"
    } else {
        $stoppedAny = $false
        foreach ($procId in $procIds) {
            try {
                Stop-Process -Id $procId -Force -ErrorAction Stop
                $stoppedAny = $true
            } catch {
                Write-Host "could not stop :$port (pid $procId)"
            }
        }
        if ($stoppedAny) { Write-Host "stopped :$port" }
    }
}

Write-Host "demo-down done"
exit 0
