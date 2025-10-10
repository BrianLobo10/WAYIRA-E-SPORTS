# Guía de Despliegue - WAYIRAE E-SPORTS

## Problema Identificado

Cuando despliegas la aplicación Angular en un hosting, el frontend no puede conectarse con el backend porque está configurado para usar `localhost:3001` (solo funciona en desarrollo).

## Solución Implementada

Se ha configurado la aplicación para que funcione tanto en desarrollo como en producción:

### 1. Configuración de Entornos

- **Desarrollo**: Usa el proxy configurado (`/api` → `localhost:3001`)
- **Producción**: Apunta directamente a tu servidor backend desplegado

### 2. Archivos Modificados

- `src/environments/environment.ts` - Configuración de desarrollo
- `src/environments/environment.prod.ts` - Configuración de producción
- `src/app/config/api.config.ts` - Configuración centralizada de la API
- `src/app/services/riot-api.service.ts` - Servicio actualizado
- `angular.json` - Configuración de build para usar entornos

## Pasos para Desplegar

### 1. Desplegar el Backend (Servidor API)

Primero necesitas desplegar tu servidor backend (`/server` folder) en un hosting como:

- **Heroku** (recomendado)
- **Railway**
- **Vercel**
- **Netlify Functions**
- **Tu propio servidor**

#### Para Heroku:

```bash
cd server
# Crear app en Heroku
heroku create tu-app-backend

# Configurar variables de entorno
heroku config:set RIOT_API_KEY=tu_api_key_aqui

# Desplegar
git subtree push --prefix server heroku main
```

### 2. Actualizar la URL del Backend

Una vez que tengas la URL de tu backend desplegado, actualiza el archivo:

`src/environments/environment.prod.ts`

```typescript
export const environment = {
  production: true,
  // Cambia esta URL por la URL real de tu servidor backend
  apiUrl: 'https://tu-app-backend.herokuapp.com/api'
};
```

### 3. Desplegar el Frontend

```bash
# Build para producción
ng build --configuration=production

# Desplegar en tu hosting preferido
# (Netlify, Vercel, GitHub Pages, etc.)
```

## Verificación

1. **En desarrollo**: `ng serve` - Debe funcionar con el proxy
2. **En producción**: La app debe conectarse directamente al backend desplegado

## Troubleshooting

### Error: "Failed to fetch" o CORS

- Verifica que la URL del backend en `environment.prod.ts` sea correcta
- Asegúrate de que el backend esté desplegado y funcionando
- Verifica que el backend tenga CORS habilitado (ya está configurado en `server.js`)

### Error: "API Key no configurada"

- Verifica que la variable de entorno `RIOT_API_KEY` esté configurada en tu hosting del backend

### Error: "Jugador no encontrado"

- Verifica que la API key de Riot sea válida y no haya expirado
- Verifica que el nombre del jugador y tagline sean correctos

## Estructura de URLs

- **Desarrollo**: `http://localhost:4200` → `http://localhost:3001/api`
- **Producción**: `https://tu-frontend.com` → `https://tu-backend.com/api`
