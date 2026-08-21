$ErrorActionPreference = 'Stop'
$hubRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$bun = 'C:\Users\jaime\.bun\bin\bun.exe'

if (-not (Test-Path -LiteralPath $bun)) {
    throw "Bun no está instalado en $bun"
}

$existing = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue
if (-not $existing) {
    Start-Process -FilePath $bun -ArgumentList 'src/server.ts' -WorkingDirectory $hubRoot -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

Start-Process 'http://localhost:4173/'
