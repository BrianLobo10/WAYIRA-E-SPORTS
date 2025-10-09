# 📖 Guía de Desarrollo - WAYIRA E-SPORTS

## 🏗️ Arquitectura del Proyecto

```
WAYIRAE-SPORTS/
│
├── 🎨 FRONTEND (Angular)
│   └── src/
│       ├── app/
│       │   ├── components/           # Componentes reutilizables
│       │   │   ├── header/          # Navegación principal
│       │   │   └── footer/          # Pie de página
│       │   │
│       │   ├── pages/               # Páginas/Vistas
│       │   │   ├── home/            # Página de inicio
│       │   │   └── summoner-search/ # Buscador de jugadores
│       │   │
│       │   ├── services/            # Servicios de datos
│       │   │   └── riot-api.service.ts
│       │   │
│       │   └── app.routes.ts        # Configuración de rutas
│       │
│       └── styles.css               # Estilos globales
│
├── ⚙️ BACKEND (Express)
│   └── server/
│       ├── server.js                # API Proxy para Riot Games
│       ├── package.json
│       ├── .env                     # Variables de entorno (crear)
│       └── .env.example             # Ejemplo de configuración
│
└── 📄 CONFIGURACIÓN
    ├── angular.json                 # Config de Angular
    ├── proxy.conf.json              # Proxy desarrollo
    ├── package.json                 # Dependencias frontend
    └── tsconfig.json                # Config TypeScript
```

## 🎨 Paleta de Colores

El proyecto usa una paleta inspirada en gaming/e-sports:

```css
/* Colores principales */
--purple-dark: #1a0b2e      /* Fondo oscuro */
--purple-medium: #2d1b4e    /* Fondo medio */
--purple-light: #7c3aed     /* Acento principal */
--purple-lighter: #a78bfa   /* Acento secundario */

/* Texto */
--text-primary: #ffffff     /* Blanco */
--text-secondary: #e9d5ff   /* Púrpura claro */
--text-muted: #c4b5fd       /* Púrpura muy claro */

/* Estados */
--success: #4ade80          /* Verde (victorias) */
--error: #f87171            /* Rojo (derrotas) */
--warning: #fbbf24          /* Amarillo (winrate) */
```

## 📱 Rutas de la Aplicación

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/` | HomeComponent | Página principal con info de la empresa |
| `/search` | SummonerSearchComponent | Buscador de jugadores de LoL |
| Cualquier otra | Redirección a `/` | Manejo de rutas no encontradas |

## 🔌 Endpoints del Backend

### GET `/api/summoner/:region/:gameName/:tagLine`

Obtiene información de un invocador.

**Parámetros:**
- `region`: Código de región (ej: `la1`, `na1`, `kr`)
- `gameName`: Nombre del invocador
- `tagLine`: Tagline del invocador (sin #)

**Ejemplo:**
```
GET /api/summoner/kr/Faker/KR1
```

**Respuesta:**
```json
{
  "id": "...",
  "puuid": "...",
  "name": "Faker",
  "gameName": "Faker",
  "tagLine": "KR1",
  "profileIconId": 5373,
  "summonerLevel": 623,
  "leagues": [
    {
      "queueType": "RANKED_SOLO_5x5",
      "tier": "CHALLENGER",
      "rank": "I",
      "leaguePoints": 1234,
      "wins": 200,
      "losses": 50
    }
  ]
}
```

### GET `/api/matches/:region/:puuid?count=5`

Obtiene IDs de las últimas partidas de un invocador.

**Parámetros:**
- `region`: Código de región
- `puuid`: PUUID del invocador
- `count`: Número de partidas (opcional, default: 5)

**Ejemplo:**
```
GET /api/matches/americas/puuid-del-jugador?count=10
```

## 🎯 Componentes Principales

### HeaderComponent
- **Ubicación:** `src/app/components/header/`
- **Función:** Navegación principal con menú responsive
- **Características:**
  - Logo de WAYIRA E-SPORTS
  - Links de navegación
  - Menú hamburguesa para móvil
  - Sticky header

### FooterComponent
- **Ubicación:** `src/app/components/footer/`
- **Función:** Pie de página con información de contacto
- **Características:**
  - Info de la empresa
  - Enlaces a servicios
  - Redes sociales
  - Disclaimer de Riot Games

### HomeComponent
- **Ubicación:** `src/app/pages/home/`
- **Función:** Landing page principal
- **Secciones:**
  - Hero con CTA
  - Misión y Visión
  - Valores corporativos
  - Servicios ofrecidos
  - Call-to-Action final

### SummonerSearchComponent
- **Ubicación:** `src/app/pages/summoner-search/`
- **Función:** Buscador de jugadores de LoL
- **Características:**
  - Formulario de búsqueda
  - Selector de región
  - Muestra perfil del jugador
  - Estadísticas de ranked
  - Manejo de errores

## 🔧 Servicios

### RiotApiService
- **Ubicación:** `src/app/services/riot-api.service.ts`
- **Función:** Comunicación con el backend
- **Métodos:**
  - `getSummoner(region, gameName, tagLine)`: Buscar jugador
  - `getMatches(region, puuid, count)`: Obtener partidas

## 🎨 Sistema de Estilos

### Estructura de CSS
Cada componente tiene sus propios estilos, pero siguen convenciones:

```css
/* Gradientes */
.gradient-text {
  background: linear-gradient(135deg, #fff 0%, #a78bfa 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* Tarjetas con efecto hover */
.card {
  background: rgba(45, 27, 78, 0.3);
  border: 1px solid rgba(124, 58, 237, 0.3);
  transition: all 0.3s ease;
}

.card:hover {
  transform: translateY(-5px);
  border-color: #7c3aed;
  box-shadow: 0 10px 30px rgba(124, 58, 237, 0.3);
}

/* Botones */
.btn-primary {
  background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%);
  box-shadow: 0 4px 15px rgba(124, 58, 237, 0.4);
}
```

### Responsive Design
- Mobile-first approach
- Breakpoints principales:
  - Mobile: < 768px
  - Tablet: 768px - 1024px
  - Desktop: > 1024px

## 🔒 Seguridad y Mejores Prácticas

### ✅ Implementado

- ✓ API Key en backend (no expuesta al cliente)
- ✓ CORS configurado correctamente
- ✓ Validación de inputs en frontend
- ✓ Manejo de errores robusto
- ✓ Cache para optimizar llamadas
- ✓ Rate limiting awareness

### 📝 Recomendaciones para Producción

1. **Variables de Entorno**
   - Usa diferentes `.env` para dev/staging/prod
   - Nunca commitees archivos `.env`

2. **API Key de Producción**
   - Solicita API key de producción en Riot Developer Portal
   - Justifica el uso (página de estadísticas)

3. **Monitoreo**
   - Implementa logging (Winston, Morgan)
   - Monitorea rate limits
   - Track de errores (Sentry)

4. **Optimización**
   - Implementa Redis para cache distribuido
   - CDN para assets estáticos
   - Compression middleware

5. **SEO**
   - Angular Universal para SSR
   - Meta tags dinámicos
   - Sitemap

## 🚀 Comandos Útiles

### Desarrollo
```bash
# Frontend
npm start                    # Inicia dev server
npm run build               # Build producción
npm run watch               # Build con watch mode

# Backend
cd server
npm start                   # Inicia servidor
npm run dev                 # Con nodemon (auto-reload)
```

### Testing
```bash
npm test                    # Run tests
npm run test:coverage       # Con coverage
```

### Linting
```bash
npm run lint                # Verifica código
```

## 📚 Recursos Adicionales

### Documentación Oficial
- [Angular](https://angular.dev/)
- [Riot Games API](https://developer.riotgames.com/)
- [Express](https://expressjs.com/)

### Assets Externos Usados
- **Data Dragon** (Riot): Íconos de perfil
- **Community Dragon**: Emblemas de ranked
- **Google Fonts**: Inter

### APIs de Terceros
- Riot Games API v4 (Summoner, League)
- Riot Games API v5 (Match)

## 🐛 Debug

### Frontend (Chrome DevTools)
1. F12 para abrir DevTools
2. Ir a Sources > webpack://
3. Buscar componente en src/app/

### Backend (VS Code)
1. Agregar breakpoints en server.js
2. Run > Start Debugging
3. Seleccionar Node.js

### Network Issues
```bash
# Ver logs del proxy
# En angular.json está configurado logLevel: "debug"

# Ver llamadas a Riot API
# El backend hace console.log de errores
```

## 💡 Tips de Desarrollo

1. **Hot Reload**: Ambos servidores tienen hot reload automático
2. **CORS**: Si tienes problemas, verifica proxy.conf.json
3. **API Key**: Actualiza cada 24h si usas dev key
4. **Cache**: El backend cachea 5 minutos, limpia si ves datos viejos
5. **Regions**: Usa el mapeo correcto (la1 para LAN, etc.)

## 📞 Soporte

Para preguntas técnicas o issues:
- Revisa primero README.md e INSTRUCCIONES.md
- Verifica los logs del backend
- Comprueba el estado de Riot API

---

**WAYIRA E-SPORTS S.A.S.**
*Desarrollando el futuro de los e-Sports en Colombia* 🎮🇨🇴

