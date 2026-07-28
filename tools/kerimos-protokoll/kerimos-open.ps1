# Öffnet den Explorer für kerimos://open?path=<url-kodierter Pfad>
# Wird vom Registry-Eintrag (kerimos-handler.reg) mit der URL als Argument aufgerufen.
param([string]$Url)

if (-not $Url) { exit }

$decoded = [uri]::UnescapeDataString($Url)

# Erwartetes Format: kerimos://open?path=C:\Projekte\... (Browser hängen
# manchmal einen Slash an, deshalb TrimEnd).
if ($decoded -match 'path=(.+)$') {
    $path = $Matches[1].TrimEnd('/').Trim()
    if (Test-Path -LiteralPath $path) {
        Start-Process explorer.exe -ArgumentList "`"$path`""
    }
}
