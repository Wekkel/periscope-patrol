@echo off
setlocal
title Periscope Patrol - Lokale Webserver
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$lines = Get-Content -LiteralPath '%~f0'; $start = $false; $sb = New-Object System.Text.StringBuilder; foreach ($line in $lines) { if ($start) { [void]$sb.AppendLine($line) } elseif ($line -match '^###POWERSHELL###') { $start = $true } }; Invoke-Expression $sb.ToString()"
if %ERRORLEVEL% neq 0 (
    echo.
    echo Er is een fout opgetreden bij het starten van de server.
    pause
)
goto :eof

###POWERSHELL###
$rootDir = (Get-Location).Path
$port = 8080
$listener = $null

# Zoek een beschikbare poort vanaf 8080
while ($port -lt 8100) {
    try {
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add("http://localhost:$port/")
        $listener.Start()
        break
    } catch {
        $listener = $null
        $port++
    }
}

if (-not $listener -or -not $listener.IsListening) {
    Write-Host "Kon geen beschikbare poort vinden tussen 8080 en 8099." -ForegroundColor Red
    exit 1
}

$url = "http://localhost:$port/"

Clear-Host
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "   Periscope Patrol - Lokale Testserver                   " -ForegroundColor Yellow
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host " Status:  Actief" -ForegroundColor Green
Write-Host " Adres:   $url" -ForegroundColor White
Write-Host " Map:     $rootDir" -ForegroundColor Gray
Write-Host ""
Write-Host " Tip: Open in je browser F12 (DevTools) en vink bij" -ForegroundColor Gray
Write-Host "      'Network' -> 'Disable cache' aan voor direct testen." -ForegroundColor Gray
Write-Host ""
Write-Host " Sluit dit venster of druk op Ctrl+C om te stoppen." -ForegroundColor DarkYellow
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host ""

# Open automatisch de browser
try {
    Start-Process $url
} catch {
    # Als openen van browser faalt, geen probleem
}

$mimeTypes = @{
    ".html"        = "text/html; charset=utf-8"
    ".htm"         = "text/html; charset=utf-8"
    ".js"          = "application/javascript; charset=utf-8"
    ".mjs"         = "application/javascript; charset=utf-8"
    ".css"         = "text/css; charset=utf-8"
    ".json"        = "application/json; charset=utf-8"
    ".webmanifest" = "application/manifest+json; charset=utf-8"
    ".png"         = "image/png"
    ".jpg"         = "image/jpeg"
    ".jpeg"        = "image/jpeg"
    ".gif"         = "image/gif"
    ".svg"         = "image/svg+xml"
    ".ico"         = "image/x-icon"
    ".wav"         = "audio/wav"
    ".mp3"         = "audio/mpeg"
    ".ogg"         = "audio/ogg"
    ".txt"         = "text/plain; charset=utf-8"
    ".md"          = "text/plain; charset=utf-8"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        try {
            $rawPath = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)
            $relative = $rawPath.TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($relative)) {
                $relative = "index.html"
            }
            $relative = $relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar)

            $fullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($rootDir, $relative))

            # Voorkom directory traversal buiten de rootmap
            if (-not $fullPath.StartsWith($rootDir, [System.StringComparison]::OrdinalIgnoreCase)) {
                $response.StatusCode = 403
                $msg = [System.Text.Encoding]::UTF8.GetBytes("403 Verboden")
                $response.ContentLength64 = $msg.Length
                $response.OutputStream.Write($msg, 0, $msg.Length)
            } elseif (Test-Path -LiteralPath $fullPath -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
                $contentType = $mimeTypes[$ext]
                if (-not $contentType) {
                    $contentType = "application/octet-stream"
                }

                $bytes = [System.IO.File]::ReadAllBytes($fullPath)
                $response.StatusCode = 200
                $response.ContentType = $contentType
                $response.ContentLength64 = $bytes.Length

                # Dev headers om cachingproblemen tijdens development te voorkomen
                $response.AddHeader("Cache-Control", "no-cache, no-store, must-revalidate")
                $response.AddHeader("Access-Control-Allow-Origin", "*")

                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                $response.OutputStream.Flush()
            } else {
                $response.StatusCode = 404
                $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Niet Gevonden: $rawPath")
                $response.ContentType = "text/plain; charset=utf-8"
                $response.ContentLength64 = $msg.Length
                $response.OutputStream.Write($msg, 0, $msg.Length)
            }
        } catch {
            # Verbinding afgebroken of andere I/O fout; ga rustig door
        } finally {
            try {
                $response.OutputStream.Close()
            } catch { }
        }
    }
} finally {
    if ($listener) {
        $listener.Stop()
        $listener.Close()
    }
}
