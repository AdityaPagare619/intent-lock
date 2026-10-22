# OmniBeat-MCP bootstrap (Windows / native PowerShell) -- zero-settings law.
# One script takes a fresh shell from nothing to "ready to run the demo":
#   .\scripts\bootstrap.ps1
#   .\scripts\demo-up.ps1
# Idempotent: safe to run twice, ten times. Never prompts.
#
# Parity spec: scripts/bootstrap.sh. This file mirrors its behaviour step
# for step, with these Windows adaptations (also noted in the report):
#   * venv lives at %LOCALAPPDATA%\omnibeat-mcp\venv (the Windows user-cache
#     equivalent of ~/.cache/omnibeat-mcp/venv). Its python is
#     Scripts\python.exe, not bin/python.
#   * No make / curl / jq checks: make is not used on the native path,
#     health checks use Invoke-WebRequest, and `make verify` is bash-only.
#   * npm is invoked through npm.cmd on purpose: under PowerShell's default
#     execution policy the npm.ps1 shim can be blocked; npm.cmd never is.
#
# PowerShell 5.1 compatible (the version Windows ships by default):
# no ternary / null-coalescing / pipeline-chain operators are used.

$ErrorActionPreference = "Continue"

# Repo root = this script's parent dir. NEVER hardcode an absolute path:
# a fresh clone must work wherever it lands (judge laptop, CI).
$OB = Split-Path -Parent $PSScriptRoot
if (-not $OB) { $OB = Split-Path -Parent (Get-Location) }

# User-cache venv, mirroring $HOME/.cache/omnibeat-mcp/venv on POSIX.
$CacheRoot = $env:LOCALAPPDATA
if (-not $CacheRoot) { $CacheRoot = Join-Path $env:USERPROFILE "AppData\Local" }
$Venv = Join-Path $CacheRoot "omnibeat-mcp\venv"
$VenvPython = Join-Path $Venv "Scripts\python.exe"
$VenvPip = Join-Path $Venv "Scripts\pip.exe"

$script:Pass = 0
$script:Fail = 0

function Write-Ok   { param([string]$Msg) Write-Host "  [ok] $Msg"; $script:Pass += 1 }
function Write-Warn { param([string]$Msg) Write-Host "  [!!] $Msg"; $script:Fail += 1 }
function Write-Soft { param([string]$Msg) Write-Host "  [!!] $Msg (optional -- not blocking readiness)" }

function Get-CmdPath {
    param([System.Management.Automation.CommandInfo]$Cmd)
    if (-not $Cmd) { return $null }
    if ($Cmd.Path) { return $Cmd.Path }
    return $Cmd.Source
}

function Show-LogTail {
    param([string]$LogFile)
    if (Test-Path $LogFile) {
        Get-Content $LogFile -Tail 4 | ForEach-Object { Write-Host "      $_" }
    }
}

# --- Python discovery -------------------------------------------------------
# Prefer the `py` launcher (installed by python.org installers): it bypasses
# the Microsoft Store stub. Fall back to `python`, but refuse the Store stub
# itself (a python.exe under ...\Microsoft\WindowsApps is not an interpreter).
$script:PythonExe = $null
$script:PythonPrefix = @()
$script:PythonVersion = ""

function Test-PythonCandidate {
    param([string]$Exe, [string[]]$Prefix)
    try {
        $allArgs = @()
        $allArgs += $Prefix
        $allArgs += "--version"
        $out = & $Exe @allArgs 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) { return $false }
        if ($out -match "Python\s+3\.") {
            $script:PythonVersion = $out.Trim()
            return $true
        }
    } catch { }
    return $false
}

$pyCmd = Get-Command py -ErrorAction SilentlyContinue
if ($pyCmd) {
    $pyPath = Get-CmdPath $pyCmd
    if ($pyPath -and (Test-PythonCandidate $pyPath @("-3"))) {
        $script:PythonExe = $pyPath
        $script:PythonPrefix = @("-3")
    }
}
if (-not $script:PythonExe) {
    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd) {
        $pythonPath = Get-CmdPath $pythonCmd
        if ($pythonPath -and ($pythonPath -notlike "*\Microsoft\WindowsApps\*")) {
            if (Test-PythonCandidate $pythonPath @()) {
                $script:PythonExe = $pythonPath
                $script:PythonPrefix = @()
            }
        }
    }
}

function Invoke-Python {
    param([string[]]$ArgsList)
    $allArgs = @()
    $allArgs += $script:PythonPrefix
    $allArgs += $ArgsList
    & $script:PythonExe @allArgs
}

# npm / npx via their .cmd shims (see header note).
$script:NpmExe = $null
$npmCmdInfo = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCmdInfo) { $script:NpmExe = Get-CmdPath $npmCmdInfo }
if (-not $script:NpmExe) {
    $npmAny = Get-Command npm -ErrorAction SilentlyContinue
    if ($npmAny) { $script:NpmExe = Get-CmdPath $npmAny }
}
$script:NpxExe = $null
$npxCmdInfo = Get-Command npx.cmd -ErrorAction SilentlyContinue
if ($npxCmdInfo) { $script:NpxExe = Get-CmdPath $npxCmdInfo }
if (-not $script:NpxExe) {
    $npxAny = Get-Command npx -ErrorAction SilentlyContinue
    if ($npxAny) { $script:NpxExe = Get-CmdPath $npxAny }
}

Write-Host "== OmniBeat-MCP bootstrap (Windows) =="

# --- 0. Preflight: tools the quickstart needs but nothing installs for you --
if ($script:PythonExe) {
    Write-Ok "python present ($($script:PythonVersion))"
} else {
    Write-Warn "python not found (or only the Microsoft Store stub) -- install Python 3.10+ from https://www.python.org/downloads/ , tick 'Add python.exe to PATH' and the 'py launcher' option, then rerun. Tip: Settings > Apps > Advanced app settings > App execution aliases -- turn OFF the python.exe / python3.exe Store aliases."
}
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersionRaw = & node --version 2>&1 | Out-String
    $nodeVersion = $nodeVersionRaw.Trim().TrimStart("v")
    $nodeMajor = 0
    [void][int]::TryParse(($nodeVersion -split "\.")[0], [ref]$nodeMajor)
    if ($nodeMajor -ge 20) { Write-Ok "node $nodeVersion (>=20)" }
    else { Write-Warn "node $nodeVersion < 20 (orchestrator needs >=20) -- install Node 20+ from https://nodejs.org , then rerun" }
} else {
    Write-Warn "node not found -- install Node 20+ from https://nodejs.org , then rerun"
}
if ($script:NpmExe) {
    $npmVersion = (& $script:NpmExe --version 2>&1 | Out-String).Trim()
    Write-Ok "npm $npmVersion"
} else {
    Write-Warn "npm not found -- it ships with Node 20+ (https://nodejs.org)"
}
if ($script:NpxExe) { Write-Ok "npx present" } else { Write-Warn "npx not found" }

# --- 1. Python venv (durable user-cache venv; ephemeral venvs are banned) ---
if ($script:PythonExe) {
    if (-not (Test-Path $VenvPython)) {
        Write-Host "-- creating venv at $Venv"
        Invoke-Python @("-m", "venv", $Venv)
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $VenvPython)) {
            Write-Host "FATAL: python -m venv failed"
            exit 1
        }
    }
    $venvVersion = & $VenvPython -c "import sys; print('.'.join(map(str, sys.version_info[:3])))" 2>&1 | Out-String
    $venvVersion = $venvVersion.Trim()
    $venvOk = & $VenvPython -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Ok "venv python $venvVersion" }
    else { Write-Warn "venv python $venvVersion < 3.10 (may still work, untested)" }

    foreach ($svc in @("omnibeat-mcp-server", "chaos-and-provider-mock")) {
        $req = Join-Path $OB "services\$svc\requirements.txt"
        if (Test-Path $req) {
            $logsDir = Join-Path $OB "logs"
            if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }
            $pipLog = Join-Path $logsDir "pip-$svc.log"
            & $VenvPip install -q -r $req *> $pipLog
            if ($LASTEXITCODE -eq 0) {
                Write-Ok "$svc requirements installed"
            } else {
                Write-Warn "$svc pip install failed -- last lines of logs\pip-$svc.log:"
                Show-LogTail $pipLog
            }
        } else {
            # Never skip silently: a missing requirements file means the
            # tree is incomplete -- say so and let readiness go red.
            Write-Warn "$svc requirements.txt NOT FOUND at $req -- tree incomplete?"
        }
    }
    & $VenvPython -c "import fastapi, uvicorn" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Ok "fastapi+uvicorn importable in venv" }
    else { Write-Warn "fastapi/uvicorn NOT importable -- check pip output above" }
}

# --- 2.5. Phonetic package (E1 sidecar) -- dist\ is gitignored, so a fresh
# clone has NO compiled sidecar: server.py would boot with E1 silently
# degraded to the stub scorer. Build it here so the quickstart is whole. -----
$Pkg = Join-Path $OB "packages\polyglot-phonetic-judo"
if (-not (Test-Path (Join-Path $Pkg "dist\index.js"))) {
    Write-Host "-- building polyglot-phonetic-judo (tsc; first run only)"
    $logsDir = Join-Path $OB "logs"
    if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }
    $phoneticLog = Join-Path $logsDir "npm-phonetic.log"
    $phoneticOk = $false
    if ($script:NpmExe) {
        Push-Location $Pkg
        try {
            & $script:NpmExe install --no-audit --no-fund *> $phoneticLog
            if ($LASTEXITCODE -eq 0) {
                & $script:NpmExe run build >> $phoneticLog 2>&1
                if ($LASTEXITCODE -eq 0) { $phoneticOk = $true }
            }
        } finally { Pop-Location }
    }
    if ($phoneticOk) {
        Write-Ok "phonetic package built (dist\index.js)"
    } else {
        Write-Warn "phonetic package build failed -- E1 sidecar will run DEGRADED (stub scorer); last lines of logs\npm-phonetic.log:"
        Show-LogTail $phoneticLog
    }
} else {
    Write-Ok "phonetic package dist present"
}
if (Test-Path (Join-Path $Pkg "sidecar.js")) { Write-Ok "E1 sidecar.js present" }
else { Write-Warn "sidecar.js missing from package" }

# --- 3. Orchestrator (:4000) -- needs node_modules + tsc build --------------
$Orch = Join-Path $OB "services\alexa-agent-orchestrator"
if (-not (Test-Path (Join-Path $Orch "node_modules"))) {
    Write-Host "-- npm ci in orchestrator (first run only)"
    $logsDir = Join-Path $OB "logs"
    if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }
    $orchLog = Join-Path $logsDir "npm-orchestrator.log"
    $orchOk = $false
    if ($script:NpmExe) {
        Push-Location $Orch
        try {
            & $script:NpmExe ci --no-audit --no-fund *> $orchLog
            if ($LASTEXITCODE -eq 0) { $orchOk = $true }
        } finally { Pop-Location }
    }
    if ($orchOk) { Write-Ok "orchestrator deps installed" }
    else {
        Write-Warn "orchestrator npm ci failed -- last lines of logs\npm-orchestrator.log:"
        Show-LogTail $orchLog
    }
} else {
    Write-Ok "orchestrator node_modules present"
}
if (-not (Test-Path (Join-Path $Orch "dist\server.js"))) {
    Write-Host "-- building orchestrator (tsc)"
    $tscCmd = Join-Path $Orch "node_modules\.bin\tsc.cmd"
    $built = $false
    if (Test-Path $tscCmd) {
        Push-Location $Orch
        try {
            & $tscCmd -p tsconfig.json
            if ($LASTEXITCODE -eq 0) { $built = $true }
        } finally { Pop-Location }
    }
    if ($built) { Write-Ok "orchestrator built (dist\server.js)" }
    else { Write-Warn "orchestrator tsc build failed" }
} else {
    Write-Ok "orchestrator dist\server.js present"
}

# --- 4. Simulator (:3000) -- needs node_modules ------------------------------
$Sim = Join-Path $OB "apps\alexa-plus-simulator"
if (-not (Test-Path (Join-Path $Sim "node_modules"))) {
    Write-Host "-- npm ci in simulator (first run only; this one is big)"
    $logsDir = Join-Path $OB "logs"
    if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }
    $simLog = Join-Path $logsDir "npm-simulator.log"
    $simOk = $false
    if ($script:NpmExe) {
        Push-Location $Sim
        try {
            & $script:NpmExe ci --no-audit --no-fund *> $simLog
            if ($LASTEXITCODE -eq 0) { $simOk = $true }
        } finally { Pop-Location }
    }
    if ($simOk) { Write-Ok "simulator deps installed" }
    else {
        Write-Warn "simulator npm ci failed -- last lines of logs\npm-simulator.log:"
        Show-LogTail $simLog
    }
} else {
    Write-Ok "simulator node_modules present"
}
if (Test-Path (Join-Path $Sim "node_modules\.bin\next.cmd")) { Write-Ok "next.js binary present" }
else { Write-Warn "next binary missing -- simulator deps incomplete" }

# --- 5. Readiness checklist ---------------------------------------------------
Write-Host ""
Write-Host "== readiness =="
Write-Host "  passed: $($script:Pass)   failed: $($script:Fail)"
if ($script:Fail -eq 0) {
    Write-Host "  READY -- setup complete; the demo launches with:  .\scripts\demo-up.ps1"
    Write-Host "  then open http://localhost:3000"
} else {
    Write-Host "  NOT READY -- fix the [!!] lines above, then rerun (safe to repeat)."
    exit 1
}
