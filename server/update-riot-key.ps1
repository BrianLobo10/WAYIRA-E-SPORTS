# update-riot-key.ps1
# Uso: .\update-riot-key.ps1 RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

param(
    [Parameter(Mandatory=$true)]
    [string]$NewKey
)

if ($NewKey -notmatch '^RGAPI-[a-f0-9-]{36}$') {
    Write-Error "Formato de key invalido. Debe ser: RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    exit 1
}

$envPath = Join-Path $PSScriptRoot ".env"

if (-not (Test-Path $envPath)) {
    Write-Error "No se encontro el archivo .env en $envPath"
    exit 1
}

$content = Get-Content $envPath -Raw
$updated = $content -replace 'RIOT_API_KEY=RGAPI-[a-f0-9-]+', "RIOT_API_KEY=$NewKey"

Set-Content $envPath $updated -Encoding utf8 -NoNewline

Write-Host "Key actualizada exitosamente en .env" -ForegroundColor Green
Write-Host "Nueva key: $NewKey" -ForegroundColor Cyan
Write-Host ""
Write-Host "Recuerda reiniciar el servidor Node para que tome efecto." -ForegroundColor Yellow
