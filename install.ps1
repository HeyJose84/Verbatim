# Auto Subtitles Generator - Installer / Linker for Adobe After Effects
$ErrorActionPreference = "Stop"

$PluginDir = $PSScriptRoot
$CepDir = "$env:APPDATA\Adobe\CEP\extensions"
$TargetDir = "$CepDir\com.brandstales.autosubtitles"

Write-Host "Installing Auto Subtitles Generator..." -ForegroundColor Cyan

# Ensure CEP extensions folder exists
if (-not (Test-Path $CepDir)) {
    New-Item -ItemType Directory -Path $CepDir -Force | Out-Null
}

# Remove existing link or directory if present
if (Test-Path $TargetDir) {
    Write-Host "Removing previous installation..." -ForegroundColor Yellow
    cmd /c rmdir "$TargetDir" 2>$null
    if (Test-Path $TargetDir) {
        Remove-Item -Recurse -Force $TargetDir
    }
}

# Create Junction link so edits in this repo are immediately reflected in AE
Write-Host "Linking extension to $TargetDir..." -ForegroundColor Green
New-Item -ItemType Junction -Path $TargetDir -Target $PluginDir | Out-Null

# Enable PlayerDebugMode in Windows Registry for CEP panels (CSXS 9 - 14)
Write-Host "Configuring Adobe CEP debug mode..." -ForegroundColor Cyan
9..14 | ForEach-Object {
    $key = "HKCU:\Software\Adobe\CSXS.$_"
    if (-not (Test-Path $key)) {
        New-Item -Path $key -Force | Out-Null
    }
    Set-ItemProperty -Path $key -Name "PlayerDebugMode" -Value "1" -Force
}

Write-Host "`n✅ Auto Subtitles Generator successfully installed!" -ForegroundColor Green
Write-Host "To use it:"
Write-Host "1. Restart Adobe After Effects (or start it if closed)."
Write-Host "2. Go to 'Window' > 'Extensions' > 'Auto Subtitles Generator'."
