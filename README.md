# WAYIRA E-SPORTS 🎮

Plataforma web para WAYIRA E-SPORTS S.A.S., empresa colombiana dedicada a la promoción y profesionalización de los deportes electrónicos.

## 🚀 Características

- **Página de inicio** con información de la empresa (Misión, Visión, Valores, Servicios)
- **Buscador de jugadores** de League of Legends integrado con Riot Games API
  - 📊 Estadísticas de ranking (Solo/Duo y Flex)
  - 🎮 Top 5 campeones más jugados con maestría
  - 📜 Historial de últimas 10 partidas
  - 🏆 Diferenciación de tipos de cola (ARAM, Ranked, Normal, etc.)
  - 📈 KDA, CS, duración de partidas
- **Diseño moderno** con estilo gaming profesional
- **Responsive** - funciona perfectamente en móviles, tablets y desktop
- **Backend seguro** - API key protegida en el servidor
- **Carga de campeones dinámica** desde Data Dragon API

## 📋 Prerequisitos

- **Node.js** (v18 o superior)
- **npm** o **yarn**
- **Riot Games API Key** (obtenla gratis en [developer.riotgames.com](https://developer.riotgames.com/))

## 🔧 Instalación

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd WAYIRAE-SPORTS
```

### 2. Instalar dependencias del Frontend (Angular)

```bash
npm install
```

### 3. Instalar dependencias del Backend (Express)

```bash
cd server
npm install
cd ..
```

### 4. Configurar Riot API Key

Crea un archivo `.env` en la carpeta `server/`:

```bash
cd server
# En Windows:
copy NUL .env
# En Linux/Mac:
touch .env
```

Edita el archivo `.env` y agrega tu API key:

```env
RIOT_API_KEY=tu_api_key_aqui
PORT=3001
```

**Importante:** Para obtener tu API key:
1. Ve a [https://developer.riotgames.com/](https://developer.riotgames.com/)
2. Inicia sesión con tu cuenta de Riot Games
3. Copia la "DEVELOPMENT API KEY"
4. ⚠️ Las API keys de desarrollo expiran cada 24 horas

## ▶️ Ejecutar la aplicación

Necesitas ejecutar **dos servidores** simultáneamente:

### Terminal 1 - Backend (Express)

```bash
cd server
npm start
```

El servidor backend correrá en `http://localhost:3001`

### Terminal 2 - Frontend (Angular)

```bash
npm start
```

La aplicación Angular correrá en `http://localhost:4200`

## 🌐 Usar la aplicación

1. Abre tu navegador en `http://localhost:4200`
2. Navega por la página de inicio para conocer WAYIRA E-SPORTS
3. Haz clic en "Buscar Jugador" o ve a la ruta `/search`
4. Ingresa el nombre del jugador y su tagline (ej: "Faker" y "KR1")
5. Selecciona la región
6. ¡Presiona buscar!

### Ejemplo de búsqueda:

- **Nombre:** Faker
- **Tagline:** KR1
- **Región:** KR - Corea

## 📁 Estructura del proyecto

```
WAYIRAE-SPORTS/
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   ├── header/          # Navegación
│   │   │   └── footer/          # Pie de página
│   │   ├── pages/
│   │   │   ├── home/            # Página principal
│   │   │   └── summoner-search/ # Buscador de jugadores
│   │   ├── services/
│   │   │   └── riot-api.service.ts  # Servicio para API
│   │   ├── app.ts
│   │   ├── app.routes.ts
│   │   └── app.config.ts
│   ├── styles.css               # Estilos globales
│   └── index.html
├── server/
│   ├── server.js                # Backend Express
│   ├── package.json
│   └── .env                     # Variables de entorno (crear)
├── proxy.conf.json              # Configuración proxy
├── angular.json
├── package.json
└── README.md
```
