# Installs Millionaire City HTML5 for the current user. Saved games live in %APPDATA%\Millionaire City HTML5 and are
# never touched; only the program folder is replaced.
# Test options: -Target <dir> installs elsewhere, -NoShortcuts skips the Start menu and desktop shortcuts.
param([string]$Target = (Join-Path $env:LOCALAPPDATA 'Programs\Millionaire City HTML5'), [switch]$NoShortcuts)
$ErrorActionPreference = 'Stop'
$name = 'Millionaire City HTML5'
$zip = Join-Path $PSScriptRoot 'game.zip'
if (Get-Process -Name $name -ErrorAction SilentlyContinue) {
  Write-Host "$name is running. Close it and run the installer again."
  exit 1
}
$staging = Join-Path ([IO.Path]::GetTempPath()) ('mcity_install_' + [Guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath $zip -DestinationPath $staging
if (Test-Path -LiteralPath $Target) { Remove-Item -LiteralPath $Target -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Split-Path $Target) | Out-Null
Move-Item -LiteralPath (Join-Path $staging $name) -Destination $Target
Remove-Item -LiteralPath $staging -Recurse -Force
$exe = Join-Path $Target "$name.exe"
$links = @()
if (-not $NoShortcuts) {
  $shell = New-Object -ComObject WScript.Shell
  foreach ($dir in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
    $lnk = Join-Path $dir "$name.lnk"
    $s = $shell.CreateShortcut($lnk); $s.TargetPath = $exe; $s.WorkingDirectory = $Target; $s.Save()
    $links += $lnk
  }
}
$uninstall = @("@echo off", "echo Removing $name (saved games in %APPDATA%\$name are kept).")
foreach ($l in $links) { $uninstall += "del `"$l`" 2>nul" }
$uninstall += "cd /d `"%TEMP%`"", "rmdir /s /q `"$Target`""
Set-Content -LiteralPath (Join-Path $Target 'Uninstall.cmd') -Value $uninstall -Encoding ascii
Write-Host "$name installed to $Target"
