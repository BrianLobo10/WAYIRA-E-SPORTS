# 🚀 Desplegar Servidor en Hosting

Este servidor puede desplegarse en varios servicios de hosting. Aquí las opciones:

## Opción 1: Railway (Recomendado - Gratis) ⭐

### Pasos:
1. Ve a: https://railway.app
2. Crea una cuenta (con GitHub)
3. Click en "New Project" → "Deploy from GitHub repo"
4. Selecciona tu repositorio
5. Railway detectará automáticamente el servidor
6. Agrega la variable de entorno:
   - `RIOT_API_KEY`: Tu API key de Riot Games
7. Railway te dará una URL automáticamente (ej: `https://tu-proyecto.up.railway.app`)

### Configuración:
- El archivo `railway.json` ya está configurado
- El servidor se iniciará automáticamente con `npm start`

### Actualizar Frontend:
En `src/environments/environment.prod.ts`:
```typescript
apiUrl: 'https://TU_PROYECTO.up.railway.app/api'
```

---

## Opción 2: Render (Gratis)

### Pasos:
1. Ve a: https://render.com
2. Crea una cuenta
3. Click en "New" → "Web Service"
4. Conecta tu repositorio de GitHub
5. Configuración:
   - **Name**: wayira-api
   - **Environment**: Node
   - **Build Command**: `cd server && npm install`
   - **Start Command**: `cd server && npm start`
   - **Port**: 3001
6. Agrega variable de entorno:
   - `RIOT_API_KEY`: Tu API key
7. Click "Create Web Service"

### Actualizar Frontend:
```typescript
apiUrl: 'https://wayira-api.onrender.com/api'
```

---

## Opción 3: Vercel (Gratis)

### Pasos:
1. Ve a: https://vercel.com
2. Conecta tu repositorio
3. Configuración:
   - **Framework Preset**: Other
   - **Root Directory**: `server`
   - **Build Command**: (dejar vacío)
   - **Output Directory**: (dejar vacío)
4. Agrega variable de entorno:
   - `RIOT_API_KEY`: Tu API key
5. Deploy

### Actualizar Frontend:
```typescript
apiUrl: 'https://TU_PROYECTO.vercel.app/api'
```

---

## Opción 4: Heroku (Pago, pero tiene plan gratuito limitado)

### Pasos:
1. Instala Heroku CLI: https://devcenter.heroku.com/articles/heroku-cli
2. Login: `heroku login`
3. Crea app: `heroku create tu-app-name`
4. Agrega variable: `heroku config:set RIOT_API_KEY=tu_key`
5. Deploy: `git push heroku main`

---

## Variables de Entorno Necesarias

En todos los servicios, necesitas configurar:

```
RIOT_API_KEY=tu_api_key_de_riot_games
PORT=3001 (opcional, algunos servicios lo asignan automáticamente)
```

---

## Verificar que Funciona

Después de desplegar, visita:
```
https://TU_URL/health
```

Deberías ver:
```json
{"status":"ok","apiKeyConfigured":true,"timestamp":"..."}
```

---

## Actualizar Frontend

Una vez que tengas la URL del servidor desplegado:

1. Edita: `src/environments/environment.prod.ts`
2. Cambia `apiUrl` por tu URL:
   ```typescript
   apiUrl: 'https://TU_URL/api'
   ```
3. Recompila: `npm run build`
4. Despliega el frontend

---

## 🆘 Problemas Comunes

**El servidor no inicia:**
- Verifica que `PORT` esté configurado (algunos servicios usan `process.env.PORT`)
- Verifica los logs en el dashboard del hosting

**Error 404:**
- Asegúrate de que las rutas incluyan `/api` (ej: `/api/summoner/...`)
- Verifica la configuración de rutas en el hosting

**API Key no funciona:**
- Verifica que la variable de entorno esté configurada correctamente
- Reinicia el servicio después de agregar variables

