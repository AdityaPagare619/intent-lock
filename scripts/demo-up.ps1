# Intent Lock demo rig (Windows / native PowerShell): idempotent launcher.
# Starts any of the 4 services that isn't already listening, waits until
# all 4 respond, and prints the URLs. Safe to run repeatedly.
# Repo root = this script's parent dir (works from any clone location,
# and from any current directory).
#
# Parity spec: scripts/demo-up.sh + the `demo` target's health-wait in the
# Makefile. Windows notes:
#   * Start-Process cannot redirect stdout and stderr to the SAME file, so
#     each service gets logs\demo-<port>.log (stdout) plus
#     logs\demo-<port>.err.log (stderr). The bash version combines both
#     into the single .log file.
#   * The simulator is started through npm.cmd (see bootstrap.ps1 header:
#     npm.ps1 can be blocked by the default execution policy; npm.cmd is not).
#   * The health-wait runs up to ~90 seconds (45 x 2s) instead of the
#     Makefile's 60s: a first Next.js dev compile on a modest Windows
#     laptop is slower. It still breaks out the moment all 4 respond.
#
# PowerShell 5.1 compatible (the version Windows ships by default).

$ErrorActionPreference = "Continue"

$OB = Split-Path -Parent $PSScriptRoot
$CacheRoot = $env:LOCALAPPDATA
if (-not $CacheRoot) { $CacheRoot = Join-Path $env:USERPROFILE "AppData\Local" }
$VenvPython = Join-Path $CacheRoot "intent-lock\venv\Scripts\python.exe"

$LogsDir = Join-Path $OB "logs"
if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir | Out-Null }

function Get-PortOrDefault {
    param([string]$EnvName, [int]$Default)
    $val = [Environment]::GetEnvironmentVariable($EnvName)
    $parsed = 0
    if ($val -and [int]::TryParse($val, [ref]$parsed)) { return $parsed }
    return $Default
}

$McpPort   = Get-PortOrDefault "INTENT_LOCK_MCP_PORT" 8080
$ChaosPort = Get-PortOrDefault "INTENT_LOCK_CHAOS_PORT" 9000
$OrchPort  = Get-PortOrDefault "INTENT_LOCK_ORCH_PORT" 4000
$SimPort   = Get-PortOrDefault "INTENT_LOCK_SIM_PORT" 3000

# "Up" for the start/skip decision, mirroring demo-up.sh's `curl -s` (no -f):
# ANY HTTP response -- even 404/500 from something squatting the port --
# counts as up, so we never double-start a port.
function Test-HttpUp {
    param([int]$Port, [string]$Path)
    try {
        $null = Invoke-WebRequest -Uri "http://127.0.0.1:$Port$Path" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        return $true
    } catch {
        if ($_.Exception -and $_.Exception.Response) { return $true }
        return $false
    }
}

# "Healthy" for the final wait, mirroring the Makefile's `curl -sf`:
# only a 2xx response from the service's real health route counts.
function Test-HealthOk {
    param([int]$Port, [string]$Path)
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port$Path" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300) { return $true }
        return $false
    } catch {
        return $false
    }
}

function Start-DemoService {
    param(
        [string]$FilePath,
        [string]$ArgumentString,
        [string]$WorkingDirectory,
        [int]$Port
    )
    $outLog = Join-Path $LogsDir "demo-$Port.log"
    $errLog = Join-Path $LogsDir "demo-$Port.err.log"
    Start-Process -FilePath $FilePath -ArgumentList $ArgumentString `
        -WorkingDirectory $WorkingDirectory `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog `
        -WindowStyle Hidden | Out-Null
    Write-Host "started :$Port"
}

if (-not (Test-Path $VenvPython)) {
    Write-Host "demo-up: venv python not found at $VenvPython"
    Write-Host "Run .\scripts\bootstrap.ps1 first."
    exit 1
}

# --- :8080 MCP server (Python / FastAPI via the venv) ------------------------
# Mirrors demo-up.sh: up if /docs answers, or if /mcp answers at all.
$up8080 = Test-HttpUp $McpPort "/docs"
if (-not $up8080) { $up8080 = Test-HttpUp $McpPort "/mcp" }
if (-not $up8080) {
    # No env config: server.py derives CORS from the request Origin.
    Start-DemoService -FilePath $VenvPython `
        -ArgumentString "src/server.py --host 127.0.0.1 --port $McpPort" `
        -WorkingDirectory (Join-Path $OB "services\intent-lock-server") `
        -Port $McpPort
}

# --- :9000 chaos + provider mock (Python / FastAPI via the venv) -------------
if (-not (Test-HttpUp $ChaosPort "/health")) {
    Start-DemoService -FilePath $VenvPython `
        -ArgumentString "src/app.py --host 127.0.0.1 --port $ChaosPort" `
        -WorkingDirectory (Join-Path $OB "services\chaos-and-provider-mock") `
        -Port $ChaosPort
}

# --- :4000 orchestrator (Node, dist build) ------------------------------------
if (-not (Test-HttpUp $OrchPort "/health")) {
    $orchDir = Join-Path $OB "services\alexa-agent-orchestrator"
    $nodeExe = "node"
    $nodeCmdInfo = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCmdInfo) {
        if ($nodeCmdInfo.Path) { $nodeExe = $nodeCmdInfo.Path }
        elseif ($nodeCmdInfo.Source) { $nodeExe = $nodeCmdInfo.Source }
    }
    # Start-Process has no per-process environment parameter in 5.1:
    # set MCP_SERVER_URL for this start, then restore the caller's value.
    $oldMcpUrl = $env:MCP_SERVER_URL
    $env:MCP_SERVER_URL = "http://127.0.0.1:$McpPort/mcp"
    try {
        Start-DemoService -FilePath $nodeExe `
            -ArgumentString "dist/server.js" `
            -WorkingDirectory $orchDir `
            -Port $OrchPort
    } finally {
        if ($null -eq $oldMcpUrl) { Remove-Item Env:MCP_SERVER_URL -ErrorAction SilentlyContinue }
        else { $env:MCP_SERVER_URL = $oldMcpUrl }
    }
}

# --- :3000 simulator (Next.js dev server) -------------------------------------
# GEMINI_API_KEY, if the user set it in this shell, is inherited by the
# child process automatically. With no key the demo still boots and locks
# on the labeled local floor.
if (-not (Test-HttpUp $SimPort "/")) {
    $simDir = Join-Path $OB "apps\alexa-plus-simulator"
    $npmExe = $null
    $npmCmdInfo = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($npmCmdInfo) {
        if ($npmCmdInfo.Path) { $npmExe = $npmCmdInfo.Path }
        elseif ($npmCmdInfo.Source) { $npmExe = $npmCmdInfo.Source }
    }
    if (-not $npmExe) {
        $npmAny = Get-Command npm -ErrorAction SilentlyContinue
        if ($npmAny) {
            if ($npmAny.Path) { $npmExe = $npmAny.Path }
            elseif ($npmAny.Source) { $npmExe = $npmAny.Source }
        }
    }
    if (-not $npmExe) {
        Write-Host "demo-up: npm not found -- install Node 20+ (https://nodejs.org), run .\scripts\bootstrap.ps1, then rerun."
        exit 1
    }
    Start-DemoService -FilePath $npmExe `
        -ArgumentString "run dev -- -p $SimPort -H 0.0.0.0" `
        -WorkingDirectory $simDir `
        -Port $SimPort
}

# --- Health-wait (Makefile `demo` parity, extended -- see header) ------------
Write-Host "waiting for all 4 services..."
$upCount = 0
for ($i = 1; $i -le 45; $i++) {
    $upCount = 0
    if (Test-HealthOk $McpPort "/health")   { $upCount += 1 }
    if (Test-HealthOk $ChaosPort "/health") { $upCount += 1 }
    if (Test-HealthOk $OrchPort "/health")  { $upCount += 1 }
    if (Test-HealthOk $SimPort "/")         { $upCount += 1 }
    if ($upCount -ge 4) { Write-Host "all 4 services responding"; break }
    Start-Sleep -Seconds 2
}

if ($upCount -lt 4) {
    Write-Host "DEMO FAILED: only $upCount/4 services responding -- read logs\ (demo-*.log and demo-*.err.log)"
    exit 1
}

Write-Host "demo stack: sim http://localhost:$SimPort - orchestrator :$OrchPort - mcp :$McpPort - chaos :$ChaosPort"
Write-Host "open http://localhost:$SimPort"
Write-Host "demo-up done"
