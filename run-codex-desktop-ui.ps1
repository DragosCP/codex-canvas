param(
    [ValidateSet("real", "mock")]
    [string]$Backend = "real",
    [ValidateSet("desktop", "tauri", "browser")]
    [string]$Shell = "desktop",
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$CacheDir = Join-Path $Root ".cache"
$Url = "http://127.0.0.1:4317"

New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
Set-Location $Root

function Get-DesktopExePath {
    Join-Path $Root "apps\desktop\src-tauri\target\release\codex-desktop.exe"
}

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

if ($Shell -eq "desktop") {
    if ($Backend -ne "real") {
        Write-Host "The built desktop app currently supports the real WSL backend path only."
        Write-Host "Use -Shell browser -Backend mock for the mock/demo fallback."
        exit 1
    }

    $exe = Get-DesktopExePath
    if (-not (Test-Path $exe)) {
        Write-Host "Built desktop app not found: $exe"
        Write-Host "Run: corepack pnpm --filter @openai/codex-desktop tauri:build"
        Write-Host "Or use: .\run-codex-desktop-ui.ps1 -Shell tauri -Backend real"
        exit 1
    }

    if ($NoOpen) {
        Write-Host "Desktop app is ready: $exe"
        exit 0
    }

    Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe)
    Write-Host "Started Codex Desktop app: $exe"
    exit 0
}

if ($Shell -eq "tauri") {
    if ($Backend -ne "real") {
        Write-Host "Tauri dev currently supports the real WSL backend path only."
        Write-Host "Use -Shell browser -Backend mock for the mock/demo fallback."
        exit 1
    }

    $CargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
    if ((Test-Path $CargoBin) -and (($env:Path -split ';') -notcontains $CargoBin)) {
        $env:Path = "$CargoBin;$env:Path"
    }

    foreach ($tool in @("corepack", "cargo")) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
            Write-Host "$tool is not available on PATH."
            Write-Host "Install Windows Rust/Cargo and open a new terminal, then retry."
            exit 1
        }
    }

    if (Test-LocalPort -Port 4317) {
        Write-Host "Desktop UI dev server is already running on 127.0.0.1:4317."
        Write-Host "If you changed shell/backend modes, stop the existing dev server first."
        exit 0
    }

    Start-HiddenServer `
        -Name "Tauri desktop app" `
        -Command "set `"PATH=$CargoBin;%PATH%`" && corepack pnpm --filter @openai/codex-desktop tauri:dev" `
        -LogFile (Join-Path $CacheDir "p03-tauri-dev.log")

    Write-Host "Tauri desktop app is starting. A native window should open shortly."
    exit 0
}

$BackendPort = if ($Backend -eq "real") { 48890 } else { 48888 }
$BackendName = if ($Backend -eq "real") { "real WSL app-server" } else { "mock app-server" }
$BackendScript = if ($Backend -eq "real") { "app-server:real" } else { "app-server:mock" }
$BackendMode = if ($Backend -eq "real") { "real-wsl" } else { "mock-dev" }
$BackendLabel = if ($Backend -eq "real") { "Real WSL app-server" } else { "Mock app-server dev backend" }
$ProjectPathHint = if ($Backend -eq "real") { "/mnt/c/Users/drago/Desktop/harnesses/codex-main" } else { "/mnt/c/Users/drago/Desktop/harnesses/codex-main/.cache/p03-desktop-demo-workspace" }

if (-not (Test-LocalPort -Port $BackendPort)) {
    Start-HiddenServer `
        -Name $BackendName `
        -Command "corepack pnpm --filter @openai/codex-desktop $BackendScript" `
        -LogFile (Join-Path $CacheDir "p03-$Backend-app-server.log")
} else {
    Write-Host "$BackendName already running on 127.0.0.1:$BackendPort."
}

if (-not (Test-LocalPort -Port 4317)) {
    $devCommand = "set `"VITE_CODEX_APP_SERVER_URL=ws://127.0.0.1:$BackendPort`" && set `"VITE_CODEX_BACKEND_LABEL=$BackendLabel`" && set `"VITE_CODEX_BACKEND_MODE=$BackendMode`" && set `"VITE_CODEX_PROJECT_PATH_HINT=$ProjectPathHint`" && corepack pnpm --filter @openai/codex-desktop dev"
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
