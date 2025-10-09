@echo off
echo ========================================
echo   WAYIRA E-SPORTS - Inicio Rapido
echo ========================================
echo.
echo Este script te ayudara a iniciar la aplicacion.
echo.

REM Verificar si existe node_modules
if not exist "node_modules\" (
    echo [1/3] Instalando dependencias del frontend...
    call npm install
    echo.
) else (
    echo [1/3] Dependencias del frontend ya instaladas
    echo.
)

REM Verificar si existe server/node_modules
if not exist "server\node_modules\" (
    echo [2/3] Instalando dependencias del backend...
    cd server
    call npm install
    cd ..
    echo.
) else (
    echo [2/3] Dependencias del backend ya instaladas
    echo.
)

REM Verificar si existe .env
if not exist "server\.env" (
    echo [3/3] ATENCION: No se encontro el archivo .env
    echo.
    echo Por favor, sigue estos pasos:
    echo 1. Ve a https://developer.riotgames.com/
    echo 2. Inicia sesion y copia tu API Key
    echo 3. Crea el archivo server\.env con este contenido:
    echo    RIOT_API_KEY=tu_api_key_aqui
    echo    PORT=3001
    echo.
    echo Presiona cualquier tecla para abrir el navegador con las instrucciones...
    pause > nul
    start https://developer.riotgames.com/
    echo.
    echo Despues de configurar el .env, ejecuta este script de nuevo.
    pause
    exit
)

echo [3/3] Archivo .env encontrado
echo.
echo ========================================
echo Iniciando servidores...
echo ========================================
echo.
echo Se abriran 2 ventanas:
echo - Backend (Express) en puerto 3001
echo - Frontend (Angular) en puerto 4200
echo.
echo NO CIERRES estas ventanas mientras uses la aplicacion.
echo.
pause

REM Iniciar backend en nueva ventana
start "WAYIRA Backend" cmd /k "cd server && npm start"

REM Esperar 3 segundos
timeout /t 3 /nobreak > nul

REM Iniciar frontend
start "WAYIRA Frontend" cmd /k "npm start"

echo.
echo ========================================
echo Los servidores se estan iniciando...
echo El navegador se abrira automaticamente en unos segundos.
echo ========================================
echo.
echo Para detener los servidores, cierra las ventanas que se abrieron.
echo.
pause

