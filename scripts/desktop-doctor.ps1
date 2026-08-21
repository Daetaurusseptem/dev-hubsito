$ErrorActionPreference = 'Stop'
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (Test-Path $cargoBin) { $env:PATH = "$cargoBin;$env:PATH" }
$checks = @(
  @{ Name = 'Bun'; Command = 'bun'; Hint = 'https://bun.sh' },
  @{ Name = 'Rust'; Command = 'rustc'; Hint = '.\scripts\setup-windows.ps1' },
  @{ Name = 'Cargo'; Command = 'cargo'; Hint = '.\scripts\setup-windows.ps1' }
)
$failed = $false
foreach ($check in $checks) {
  $found = Get-Command $check.Command -ErrorAction SilentlyContinue
  if ($found) { Write-Host "[OK] $($check.Name): $(& $check.Command --version)" -ForegroundColor Green }
  else { Write-Host "[FALTA] $($check.Name) - $($check.Hint)" -ForegroundColor Yellow; $failed = $true }
}
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path $vswhere) { Write-Host '[OK] Visual Studio Build Tools' -ForegroundColor Green }
else { Write-Host '[FALTA] Visual Studio Build Tools C++' -ForegroundColor Yellow; $failed = $true }
if ($failed) { exit 1 }
Write-Host 'DevHubsito está listo para bun run desktop:build' -ForegroundColor Cyan
