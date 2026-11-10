# WAYIRA - commit + publicar (funcion Riot + web).
# Uso: en PowerShell, dentro de la carpeta del proyecto:  .\publicar.ps1
# ANTES: pega supabase\PEGAR_EN_SQL_EDITOR_tema.sql en Supabase > SQL Editor > Run.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Paso($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }

Paso '1/4 Commit'
git add -A
git status --short
git commit -m "Apariencia: 80 fuentes, 28 paletas y 12 estilos; buscador cuenta todos los modos (ARAM, ARAM: Caos, Arena...)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
if ($LASTEXITCODE -ne 0) { Write-Host 'Nada nuevo que commitear, sigo.' -ForegroundColor Yellow }

Paso '2/4 Funcion riot (Supabase)'
npx supabase functions deploy riot --project-ref vghcjtdfwtbznowlovxa --no-verify-jwt
if ($LASTEXITCODE -ne 0) { throw 'Fallo el deploy de la funcion. Si pide login: npx supabase login' }

Paso '3/4 Build'
npm run build:prod
if ($LASTEXITCODE -ne 0) { throw 'Fallo el build' }

Paso '4/4 Hosting (Firebase)'
firebase deploy --only hosting
if ($LASTEXITCODE -ne 0) { throw 'Fallo el deploy de Firebase' }

Write-Host "`nListo. Si quieres subirlo a GitHub: git push" -ForegroundColor Green
