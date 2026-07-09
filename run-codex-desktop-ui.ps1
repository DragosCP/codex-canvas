param(
    [ValidateSet("real", "mock")]
    [string]$Backend = "real",
    [ValidateSet("desktop", "browser")]
    [string]$Shell = "desktop",
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$CacheDir = Join-Path $Root ".cache"
$Url = "http://127.0.0.1:4317"

New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
Set-Location $Root

function Test-LocalPort {
    param([int]$Port)

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $result = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $result.AsyncWaitHandle.WaitOne(400)) {
            return $false
        }

        $client.EndConnect($result)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Start-HiddenServer {
    param(
        [string]$Name,
        [string]$Command,
        [string]$LogFile
    )

    $cmd = "cd /d `"$Root`" && $Command > `"$LogFile`" 2>&1"
    Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $cmd) -WindowStyle Hidden | Out-Null
    Write-Host "Started $Name. Log: $LogFile"
}

function Convert-ToWslPath {
    param([string]$Path)

    $resolved = (Resolve-Path -LiteralPath $Path).Path
    if ($resolved -match "^([A-Za-z]):\\(.*)$") {
        $drive = $matches[1].ToLowerInvariant()
        $rest = $matches[2] -replace "\\", "/"
        return "/mnt/$drive/$rest"
    }

    return $resolved -replace "\\", "/"
}

function Test-CodexLocalWindow {
    $mainScript = (Join-Path $Root "apps\desktop\electron\main.cjs").ToLowerInvariant()
    $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -eq "electron.exe" -and
            $_.CommandLine -and
            $_.CommandLine.ToLowerInvariant().Contains($mainScript)
        } |
        Select-Object -First 1
    return [bool]$processes
}

if ($Shell -eq "desktop") {
    if ($Backend -ne "real") {
        Write-Host "The Electron desktop app currently supports the real native backend path only."
        Write-Host "Use -Shell browser -Backend mock for the mock/demo fallback."
        exit 1
    }

    $electronRunner = Join-Path $Root "apps\desktop\electron\run.mjs"
    $desktopBundle = Join-Path $Root "apps\desktop\dist\index.html"

    if (-not (Test-Path $electronRunner)) {
        Write-Host "Electron launcher not found: $electronRunner"
        Write-Host "Check that apps\desktop\electron is present on this branch."
        exit 1
    }

    if (-not (Test-Path $desktopBundle)) {
        Write-Host "Desktop renderer bundle not found: $desktopBundle"
        Write-Host "Run: corepack pnpm --filter codex-local-desktop build"
        exit 1
    }

    if ($NoOpen) {
        Write-Host "Electron desktop app is ready: $electronRunner"
        exit 0
    }

    if (Test-CodexLocalWindow) {
        Write-Host "Codex Local already appears to be running."
        exit 0
    }

    $launchLog = Join-Path $CacheDir ("codex-local-electron-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
    Start-HiddenServer `
        -Name "Codex Local Electron" `
        -Command "corepack pnpm --filter codex-local-desktop electron:run" `
        -LogFile $launchLog

    Write-Host "Codex Local Electron is starting. A native window should open shortly."
    exit 0
}

$BackendPort = if ($Backend -eq "real") { 48890 } else { 48888 }
$BackendName = if ($Backend -eq "real") { "real WSL app-server" } else { "mock app-server" }
$BackendScript = if ($Backend -eq "real") { "app-server:real" } else { "app-server:mock" }
$BackendMode = if ($Backend -eq "real") { "real-wsl" } else { "mock-dev" }
$BackendLabel = if ($Backend -eq "real") { "Real WSL app-server" } else { "Mock app-server dev backend" }
$ProjectPathHintOverride = $env:VITE_CODEX_PROJECT_PATH_HINT
if ([string]::IsNullOrWhiteSpace($ProjectPathHintOverride)) {
    $ProjectPathHintOverride = $env:CODEX_PROJECT_PATH_HINT
}
$DefaultProjectPathHint = if ($Backend -eq "real") {
    Convert-ToWslPath -Path $Root
} else {
    Convert-ToWslPath -Path (Join-Path $CacheDir "p03-desktop-demo-workspace")
}
$ProjectPathHint = if ([string]::IsNullOrWhiteSpace($ProjectPathHintOverride)) {
    $DefaultProjectPathHint
} else {
    $ProjectPathHintOverride
}

if (-not (Test-LocalPort -Port $BackendPort)) {
    Start-HiddenServer `
        -Name $BackendName `
        -Command "corepack pnpm --filter codex-local-desktop $BackendScript" `
        -LogFile (Join-Path $CacheDir "p03-$Backend-app-server.log")
} else {
    Write-Host "$BackendName already running on 127.0.0.1:$BackendPort."
}

if (-not (Test-LocalPort -Port 4317)) {
    $devCommand = "set `"VITE_CODEX_APP_SERVER_URL=ws://127.0.0.1:$BackendPort`" && set `"VITE_CODEX_BACKEND_LABEL=$BackendLabel`" && set `"VITE_CODEX_BACKEND_MODE=$BackendMode`" && set `"VITE_CODEX_PROJECT_PATH_HINT=$ProjectPathHint`" && corepack pnpm --filter codex-local-desktop dev"
    Start-HiddenServer `
        -Name "desktop UI" `
        -Command $devCommand `
        -LogFile (Join-Path $CacheDir "p03-desktop-ui.log")
} else {
    Write-Host "Desktop UI already running on 127.0.0.1:4317."
    Write-Host "If you changed backend modes, stop the existing UI server and relaunch."
}

$ready = $false
for ($i = 0; $i -lt 50; $i++) {
    if (Test-LocalPort -Port 4317) {
        $ready = $true
        break
    }
    Start-Sleep -Milliseconds 500
}

if ($ready) {
    if ($NoOpen) {
        Write-Host "Desktop UI is ready: $Url"
    } else {
        Start-Process $Url
    }
} else {
    Write-Host "Desktop UI did not become ready on $Url."
    Write-Host "Check logs in $CacheDir."
    exit 1
}
