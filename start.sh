#!/bin/bash

echo "========================================"
echo "  WAYIRA E-SPORTS - Inicio Rápido"
echo "========================================"
echo ""
echo "Este script te ayudará a iniciar la aplicación."
echo ""

# Verificar si existe node_modules
if [ ! -d "node_modules" ]; then
    echo "[1/3] Instalando dependencias del frontend..."
    npm install
    echo ""
else
    echo "[1/3] Dependencias del frontend ya instaladas ✓"
    echo ""
fi

# Verificar si existe server/node_modules
if [ ! -d "server/node_modules" ]; then
    echo "[2/3] Instalando dependencias del backend..."
    cd server
    npm install
    cd ..
    echo ""
else
    echo "[2/3] Dependencias del backend ya instaladas ✓"
    echo ""
fi

# Verificar si existe .env
if [ ! -f "server/.env" ]; then
    echo "[3/3] ⚠️  ATENCIÓN: No se encontró el archivo .env"
    echo ""
    echo "Por favor, sigue estos pasos:"
    echo "1. Ve a https://developer.riotgames.com/"
    echo "2. Inicia sesión y copia tu API Key"
    echo "3. Crea el archivo server/.env con este contenido:"
    echo "   RIOT_API_KEY=tu_api_key_aqui"
    echo "   PORT=3001"
    echo ""
    echo "Puedes crearlo con:"
    echo "   cd server"
    echo "   nano .env"
    echo ""
    echo "Después de configurar el .env, ejecuta este script de nuevo."
    exit 1
fi

echo "[3/3] Archivo .env encontrado ✓"
echo ""
echo "========================================"
echo "Iniciando servidores..."
echo "========================================"
echo ""
echo "Se iniciarán 2 procesos:"
echo "- Backend (Express) en puerto 3001"
echo "- Frontend (Angular) en puerto 4200"
echo ""
echo "Presiona Ctrl+C para detener los servidores."
echo ""

# Función para manejar Ctrl+C
trap 'echo ""; echo "Deteniendo servidores..."; kill 0' SIGINT

# Iniciar backend en background
cd server
npm start &
BACKEND_PID=$!
cd ..

# Esperar 3 segundos
sleep 3

# Iniciar frontend
npm start &
FRONTEND_PID=$!

echo ""
echo "========================================"
echo "✓ Servidores iniciados"
echo "- Backend PID: $BACKEND_PID"
echo "- Frontend PID: $FRONTEND_PID"
echo "========================================"
echo ""
echo "El navegador debería abrirse automáticamente."
echo "Si no, abre http://localhost:4200"
echo ""
echo "Presiona Ctrl+C para detener."

# Esperar a que terminen los procesos
wait

