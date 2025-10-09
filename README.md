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
