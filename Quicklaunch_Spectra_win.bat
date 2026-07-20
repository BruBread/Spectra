@echo off & powershell -NoProfile -STA -ExecutionPolicy Bypass -Command "$ScriptDir='%~dp0'.TrimEnd('\'); $c = Get-Content -Raw -LiteralPath '%~f0'; $m='#PS1_START#'; $i = $c.LastIndexOf($m); Invoke-Expression $c.Substring($i + $m.Length)" & exit /b

#PS1_START#
# Everything below this line is PowerShell. The single line above is what
# cmd.exe actually runs when you double-click this file - it reads this same
# file text, cuts off everything after the marker, and runs it as a
# PowerShell script (in STA mode, needed for the folder picker). Do not
# reorder or remove the top line.

Add-Type -AssemblyName System.Windows.Forms

function Info($msg) { Write-Host "==> $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "!!  $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "xx  $msg" -ForegroundColor Red }

$GITHUB_OWNER  = "BruBread"
$GITHUB_REPO   = "Spectra"
$GITHUB_BRANCH = "main"

# ---------------------------------------------------------------------------
# 0. Ask where the repo is (remembers your last choice for next time)
# ---------------------------------------------------------------------------
$cacheFile = Join-Path $ScriptDir ".quicklaunch-last-path.txt"
$initialPath = $ScriptDir
if (Test-Path $cacheFile) {
    $cached = (Get-Content $cacheFile -Raw -ErrorAction SilentlyContinue).Trim()
    if ($cached -and (Test-Path $cached)) { $initialPath = $cached }
}

$RootDir = $null
while (-not $RootDir) {
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = "Select your Spectra repo folder (the one containing backend-spectra and frontend-spectra)"
    $dialog.SelectedPath = $initialPath
    $dialog.ShowNewFolderButton = $false

    $result = $dialog.ShowDialog()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
        Write-Host "Cancelled - nothing was started."
        Read-Host "Press Enter to close"
        exit 0
    }

    $candidate = $dialog.SelectedPath
    $backendCheck  = Join-Path $candidate "backend-spectra"
    $frontendCheck = Join-Path $candidate "frontend-spectra"

    if ((Test-Path $backendCheck) -and (Test-Path $frontendCheck)) {
        $RootDir = $candidate
    } else {
        [System.Windows.Forms.MessageBox]::Show(
            "That folder doesn't contain both 'backend-spectra' and 'frontend-spectra'.`n`nPick the repo's top-level folder instead.",
            "Wrong folder", "OK", "Warning"
        ) | Out-Null
        $initialPath = $candidate
    }
}

Set-Content -Path $cacheFile -Value $RootDir
$BackendDir  = Join-Path $RootDir "backend-spectra"
$FrontendDir = Join-Path $RootDir "frontend-spectra"
Info "Using repo: $RootDir"

# ---------------------------------------------------------------------------
# 1. Check GitHub for updates on main, ask before pulling
# ---------------------------------------------------------------------------
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCmd) {
    Warn "git isn't installed - skipping auto-update check."
} elseif (-not (Test-Path (Join-Path $RootDir ".git"))) {
    Warn "This folder isn't a git clone - skipping auto-update check."
} else {
    Info "Checking GitHub for updates on $GITHUB_BRANCH..."
    $remoteSha = $null
    try {
        $apiUrl = "https://api.github.com/repos/$GITHUB_OWNER/$GITHUB_REPO/commits/$GITHUB_BRANCH"
        $resp = Invoke-RestMethod -Uri $apiUrl -Headers @{ "User-Agent" = "Quicklaunch-Spectra" } -TimeoutSec 8
        $remoteSha = $resp.sha
    } catch {
        Warn "Couldn't reach GitHub to check for updates. Continuing without checking."
    }

    if ($remoteSha) {
        Push-Location $RootDir
        $localSha = (git rev-parse HEAD 2>$null).Trim()
        Pop-Location

        if ($localSha -and ($localSha -ne $remoteSha)) {
            $choice = [System.Windows.Forms.MessageBox]::Show(
                "A newer version is available on GitHub ($GITHUB_BRANCH).`n`nPull the latest changes before launching?",
                "Update available",
                [System.Windows.Forms.MessageBoxButtons]::YesNoCancel,
                [System.Windows.Forms.MessageBoxIcon]::Information
            )
            if ($choice -eq [System.Windows.Forms.DialogResult]::Cancel) {
                Write-Host "Cancelled - nothing was started."
                Read-Host "Press Enter to close"
                exit 0
            }
            if ($choice -eq [System.Windows.Forms.DialogResult]::Yes) {
                Info "Pulling latest changes..."
                Push-Location $RootDir
                git pull origin $GITHUB_BRANCH
                $pullOk = ($LASTEXITCODE -eq 0)
                Pop-Location
                if ($pullOk) {
                    Info "Updated to the latest commit."
                    # Force a fresh dependency install since code just changed
                    Remove-Item -Recurse -Force (Join-Path $BackendDir "node_modules") -ErrorAction SilentlyContinue
                    Remove-Item -Recurse -Force (Join-Path $FrontendDir "node_modules") -ErrorAction SilentlyContinue
                    Info "Continuing straight to launch..."
                } else {
                    Warn "git pull failed - continuing with the current code."
                }
            } else {
                Info "Skipping update, launching current code."
            }
        } else {
            Info "Already up to date."
        }
    }
}

# ---------------------------------------------------------------------------
# 2. Node.js 20+
# ---------------------------------------------------------------------------
function Test-NodeOk {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) { return $false }
    $verString = (node -v) -replace "v", ""
    $major = [int]($verString.Split(".")[0])
    return $major -ge 20
}

if (Test-NodeOk) {
    Info "Node $(node -v) found."
} else {
    Warn "Node.js 20+ not found. Attempting to install via winget..."
    $wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $wingetCmd) {
        Fail "winget isn't available. Install Node 20+ manually from https://nodejs.org (LTS installer), then re-run this file."
        Read-Host "Press Enter to exit"
        exit 1
    }
    winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    Fail "Node was just installed. Close this window and double-click this file again so the updated PATH is picked up."
    Read-Host "Press Enter to exit"
    exit 1
}

# ---------------------------------------------------------------------------
# 3. Docker
# ---------------------------------------------------------------------------
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCmd) {
    Fail "Docker isn't installed."
    Write-Host "    Docker needs a GUI installer and admin approval, so this can't be automated."
    Write-Host "    Download it from: https://www.docker.com/products/docker-desktop/"
    Write-Host "    Install it, open Docker Desktop, wait for 'Engine running', then re-run this file."
    Read-Host "Press Enter to exit"
    exit 1
}
Info "Docker found."

$dockerRunning = $false
try { docker info *>$null; $dockerRunning = $true } catch { $dockerRunning = $false }

if (-not $dockerRunning) {
    Warn "Docker engine isn't running. Trying to launch Docker Desktop..."
    Start-Process "Docker Desktop"
    Write-Host "    Waiting for Docker to be ready..." -NoNewline
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        try { docker info *>$null; $ready = $true; break } catch { Write-Host "." -NoNewline }
    }
    Write-Host ""
    if (-not $ready) {
        Fail "Docker still isn't responding. Open Docker Desktop manually, wait for 'Engine running', then re-run this file."
        Read-Host "Press Enter to exit"
        exit 1
    }
}
Info "Docker engine is running."

# ---------------------------------------------------------------------------
# 4. MongoDB container
# ---------------------------------------------------------------------------
$existing = docker ps -a --format "{{.Names}}" | Select-String -Pattern "^spectra-mongo$"
if ($existing) {
    $running = docker ps --format "{{.Names}}" | Select-String -Pattern "^spectra-mongo$"
    if ($running) { Info "MongoDB container already running." }
    else { Info "Starting existing MongoDB container..."; docker start spectra-mongo | Out-Null }
} else {
    Info "Creating MongoDB container..."
    docker run -d -p 27017:27017 -v spectra-mongo-data:/data/db --name spectra-mongo mongo | Out-Null
}

# ---------------------------------------------------------------------------
# 5. Env files
# ---------------------------------------------------------------------------
$backendEnv = Join-Path $BackendDir ".env.local"
if (-not (Test-Path $backendEnv)) { Copy-Item (Join-Path $BackendDir ".env.local.example") $backendEnv }
$frontendEnv = Join-Path $FrontendDir ".env.local"
if (-not (Test-Path $frontendEnv)) { Copy-Item (Join-Path $FrontendDir ".env.local.example") $frontendEnv }

# ---------------------------------------------------------------------------
# 6. Dependencies (first run, an update just wiped node_modules, or a
#    previous install was left incomplete). We check for the actual CLI
#    binaries inside node_modules/.bin rather than just the folder existing,
#    since a folder can exist but be missing packages from an interrupted
#    install - that's what caused 'next' is not recognized.
#    --loglevel http makes npm print each package as it's fetched, so it's
#    obvious what's happening instead of a silent spinner.
# ---------------------------------------------------------------------------
function Test-DepsOk($dir, $binName) {
    $binPath = Join-Path $dir "node_modules\.bin\$binName.cmd"
    return (Test-Path (Join-Path $dir "node_modules")) -and (Test-Path $binPath)
}

if (-not (Test-Path (Join-Path $BackendDir "node_modules"))) {
    Info "Installing backend dependencies (this can take a few minutes)..."
    Push-Location $BackendDir; npm install --loglevel http; Pop-Location
}
if (-not (Test-DepsOk $FrontendDir "next")) {
    if (Test-Path (Join-Path $FrontendDir "node_modules")) {
        Warn "frontend-spectra/node_modules looks incomplete - reinstalling clean..."
        Remove-Item -Recurse -Force (Join-Path $FrontendDir "node_modules") -ErrorAction SilentlyContinue
    }
    Info "Installing frontend dependencies (this can take a few minutes)..."
    Push-Location $FrontendDir; npm install --loglevel http; Pop-Location
}

# ---------------------------------------------------------------------------
# 7. Run both servers, each in its own visible window.
#    No -NoExit here on purpose: when npm run dev ends (Ctrl+C in that
#    window, a crash, or the window being closed), the "; exit" makes the
#    whole spawned PowerShell process end too - which is how we detect it
#    below and shut the other one down automatically.
# ---------------------------------------------------------------------------
function Test-ProcAlive($procId) {
    return $null -ne (Get-Process -Id $procId -ErrorAction SilentlyContinue)
}

function Stop-ProcTree($procId) {
    if (Test-ProcAlive $procId) {
        taskkill /F /T /PID $procId | Out-Null
    }
}

Info "Starting backend..."
$backendCmd = "cd '$BackendDir'; npm run dev; Write-Host ''; Write-Host '--- backend process ended (see any error above) ---' -ForegroundColor Red; Read-Host 'Press Enter to close this window'; exit"
$backendProc = Start-Process powershell -ArgumentList "-NoProfile", "-Command", $backendCmd -PassThru

Info "Waiting for backend on port 4000..."
for ($i = 0; $i -lt 30; $i++) {
    try { Invoke-WebRequest -Uri "http://localhost:4000/api/health" -UseBasicParsing -TimeoutSec 2 | Out-Null; break }
    catch { Start-Sleep -Seconds 1 }
}

Info "Starting frontend..."
$frontendCmd = "cd '$FrontendDir'; npm run dev; Write-Host ''; Write-Host '--- frontend process ended (see any error above) ---' -ForegroundColor Red; Read-Host 'Press Enter to close this window'; exit"
$frontendProc = Start-Process powershell -ArgumentList "-NoProfile", "-Command", $frontendCmd -PassThru

Info "Waiting for frontend on port 3000..."
for ($i = 0; $i -lt 30; $i++) {
    try { Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2 | Out-Null; break }
    catch { Start-Sleep -Seconds 1 }
}

Write-Host ""
Info "Spectra is running:"
Write-Host "     Frontend: http://localhost:3000"
Write-Host "     Backend:  http://localhost:4000"
Write-Host ""
Write-Host "    Ctrl+C (or close) EITHER server window and the other will shut down automatically."
Write-Host ""

Start-Process "http://localhost:3000"

# ---------------------------------------------------------------------------
# 8. Watch both windows. The moment either one exits, kill the other.
# ---------------------------------------------------------------------------
while ((Test-ProcAlive $backendProc.Id) -and (Test-ProcAlive $frontendProc.Id)) {
    Start-Sleep -Seconds 1
}

if (-not (Test-ProcAlive $backendProc.Id)) {
    Warn "Backend window closed - stopping frontend too..."
    Stop-ProcTree $frontendProc.Id
} else {
    Warn "Frontend window closed - stopping backend too..."
    Stop-ProcTree $backendProc.Id
}

Info "Both servers are stopped."
Read-Host "Press Enter to close this window"
