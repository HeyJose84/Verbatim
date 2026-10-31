# Auto Subtitles Generator - Installer / Linker for Adobe After Effects
$PluginDir = $PSScriptRoot
$CepDir = "$env:APPDATA\Adobe\CEP\extensions"
$TargetDir = "$CepDir\com.brandstales.autosubtitles"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Installing Auto Subtitles Generator for After Effects..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Ensure CEP extensions folder exists
if (-not (Test-Path $CepDir)) {
    New-Item -ItemType Directory -Path $CepDir -Force | Out-Null
}

# 2. Remove existing link or directory if present
if (Test-Path $TargetDir) {
    Write-Host "Updating previous installation..." -ForegroundColor Yellow
    cmd /c rmdir "$TargetDir" 2>$null
    if (Test-Path $TargetDir) {
        Remove-Item -Recurse -Force $TargetDir
    }
}

# 3. Create Junction link so edits are immediately reflected in AE
Write-Host "Linking extension to $TargetDir..." -ForegroundColor Green
New-Item -ItemType Junction -Path $TargetDir -Target $PluginDir | Out-Null

# 4. Enable PlayerDebugMode in Windows Registry for CEP panels (CSXS 9 - 16)
Write-Host "Configuring Adobe CEP debug mode..." -ForegroundColor Cyan
9..16 | ForEach-Object {
    $key = "HKCU:\Software\Adobe\CSXS.$_"
    if (-not (Test-Path $key)) {
        New-Item -Path $key -Force | Out-Null
    }
    Set-ItemProperty -Path $key -Name "PlayerDebugMode" -Value "1" -Force
}

# 5. Check Python & Speech Engine dependencies
Write-Host "Checking Python speech engine requirements..." -ForegroundColor Cyan
$pythonExe = $null
$candidates = @(
    "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
    "C:\Python311\python.exe",
    "C:\Python312\python.exe"
)

foreach ($c in $candidates) {
    if (Test-Path $c) {
        $pythonExe = $c
        break
    }
}

if (-not $pythonExe) {
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) {
        $pythonExe = $cmd.Source
    }
}

if ($pythonExe) {
    Write-Host "Found Python: $pythonExe" -ForegroundColor Gray
    & "$pythonExe" -c "import faster_whisper" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "faster-whisper is installed and ready." -ForegroundColor Green
    } else {
        Write-Host "faster-whisper is not installed. Installing required dependencies..." -ForegroundColor Yellow
        & "$pythonExe" -m pip install -r "$PluginDir\backend\requirements.txt"
    }
} else {
    Write-Host "[WARNING] Python was not found in PATH." -ForegroundColor Yellow
    Write-Host "Please install Python 3.9+ and run: pip install faster-whisper" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Auto Subtitles Generator successfully installed!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Next steps:"
Write-Host "1. Restart Adobe After Effects (or launch it if closed)."
Write-Host "2. In After Effects menu, open: Window -> Extensions -> Auto Subtitles Generator"
