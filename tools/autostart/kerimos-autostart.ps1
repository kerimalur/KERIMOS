# ============================================================================
# KerimOS beim Hochfahren öffnen
#
# Legt eine Verknüpfung im Autostart-Ordner an, die KerimOS im App-Modus
# startet: eigenes Fenster, keine Adresszeile, keine Tabs.
#
# Ausführen (Rechtsklick auf die Datei -> "Mit PowerShell ausführen"), oder:
#   powershell -ExecutionPolicy Bypass -File kerimos-autostart.ps1
#
# Entfernen:
#   powershell -ExecutionPolicy Bypass -File kerimos-autostart.ps1 -Entfernen
# ============================================================================

param([switch]$Entfernen)

$url       = 'https://kerimos.vercel.app/'
$startup   = [Environment]::GetFolderPath('Startup')
$linkPfad  = Join-Path $startup 'KerimOS.lnk'

if ($Entfernen) {
    if (Test-Path $linkPfad) {
        Remove-Item $linkPfad
        Write-Host 'Autostart entfernt.' -ForegroundColor Green
    } else {
        Write-Host 'Es gab keinen Autostart-Eintrag.' -ForegroundColor Yellow
    }
    return
}

# Browser suchen: Chrome zuerst, sonst Edge. Beide können den App-Modus.
$kandidaten = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
$browser = $kandidaten | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $browser) {
    Write-Host 'Weder Chrome noch Edge gefunden. Pfad im Skript ergänzen.' -ForegroundColor Red
    return
}

$shell = New-Object -ComObject WScript.Shell
$link  = $shell.CreateShortcut($linkPfad)
$link.TargetPath       = $browser
# --app öffnet ohne Adresszeile; die Anmeldung bleibt im Browserprofil erhalten
$link.Arguments        = "--app=$url"
$link.WorkingDirectory = Split-Path $browser
$link.Description      = 'KerimOS beim Anmelden starten'
$link.Save()

Write-Host "Autostart eingerichtet mit $(Split-Path $browser -Leaf)." -ForegroundColor Green
Write-Host "Verknüpfung: $linkPfad"
Write-Host 'Beim nächsten Hochfahren öffnet sich KerimOS von selbst.'
