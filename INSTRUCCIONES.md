# 🚀 Instrucciones Rápidas - WAYIRA E-SPORTS

## ⚡ Inicio Rápido (3 pasos)

### 1️⃣ Instalar dependencias

```bash
# Frontend
npm install

# Backend
cd server
npm install
cd ..
```

### 2️⃣ Configurar API Key de Riot Games

1. Ve a [https://developer.riotgames.com/](https://developer.riotgames.com/)
2. Inicia sesión con tu cuenta de Riot Games
3. Copia tu "DEVELOPMENT API KEY"
4. Crea el archivo `.env` en la carpeta `server/`:

**Windows PowerShell:**
```powershell
cd server
New-Item .env -ItemType File
notepad .env
```

**Windows CMD:**
```cmd
cd server
type nul > .env
notepad .env
```

**Linux/Mac:**
```bash
cd server
touch .env
nano .env
```

5. Pega este contenido en el archivo `.env` (reemplaza con tu API key real):

```env
RIOT_API_KEY=RGAPI-tu-api-key-aqui
PORT=3001
```

6. Guarda y cierra el archivo

### 3️⃣ Ejecutar la aplicación

Abre **DOS TERMINALES** (o ventanas de PowerShell/CMD):

**Terminal 1 - Backend:**
```bash
cd server
npm start
```
Deberías ver: `🚀 Servidor API corriendo en http://localhost:3001`

**Terminal 2 - Frontend:**
```bash
npm start
```
Deberías ver que se abre automáticamente `http://localhost:4200`

## ✅ ¡Listo!

Ahora puedes:
- Ver la página principal en `http://localhost:4200`
- Hacer clic en "Buscar Jugador"
- Buscar cualquier jugador de League of Legends

### Ejemplo de búsqueda:
- **Nombre:** Faker
- **Tagline:** KR1 (sin el símbolo #)
- **Región:** KR - Corea

## ❓ Problemas comunes

### "API Key no configurada"
- Verifica que creaste el archivo `.env` en la carpeta `server/`
- Verifica que copiaste bien la API key (sin espacios)
- Reinicia el servidor backend

### "Jugador no encontrado"
- Verifica el nombre y tagline (usa el formato nuevo de Riot: NombreJugador#TAG)
- Asegúrate de seleccionar la región correcta
- Ejemplo: Para "Hide on bush" de Faker, sería "Hide on bush" y "KR1"

### Error 403 o 401
- Tu API key expiró (duran 24 horas)
- Genera una nueva en [developer.riotgames.com](https://developer.riotgames.com/)
- Actualiza el archivo `.env`
- Reinicia el servidor backend

### No se conecta al backend
- Asegúrate que el servidor backend está corriendo (Terminal 1)
- Debe mostrar "🔑 API Key configurada ✓"
- Verifica que está en el puerto 3001

## 📚 Más información

Lee el archivo `README.md` completo para:
- Estructura del proyecto
- Despliegue en producción
- Configuración avanzada
- Información de contacto

---

**¿Necesitas ayuda?** Contacta a WAYIRA E-SPORTS
- 📧 info@wayiraesports.com
- 📍 La Guajira, Colombia

