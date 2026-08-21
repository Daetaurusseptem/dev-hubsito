$ErrorActionPreference = 'Stop'
$downloadDir = Join-Path $env:TEMP 'devhubsito-prerequisites'
New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null

if (-not (Get-Command rustup -ErrorAction SilentlyContinue)) {
  $rustup = Join-Path $downloadDir 'rustup-init.exe'
  Invoke-WebRequest 'https://win.rustup.rs/x86_64' -OutFile $rustup
  Start-Process -FilePath $rustup -ArgumentList '-y','--default-toolchain','stable-x86_64-pc-windows-msvc' -Wait
}

$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path $vswhere)) {
  $buildTools = Join-Path $downloadDir 'vs_buildtools.exe'
  Invoke-WebRequest 'https://aka.ms/vs/17/release/vs_BuildTools.exe' -OutFile $buildTools
  Start-Process -FilePath $buildTools -ArgumentList '--quiet','--wait','--norestart','--add','Microsoft.VisualStudio.Workload.VCTools','--includeRecommended' -Verb RunAs -Wait
}

Write-Host 'Prerequisitos instalados. Cierra y abre la terminal antes de compilar.' -ForegroundColor Green

