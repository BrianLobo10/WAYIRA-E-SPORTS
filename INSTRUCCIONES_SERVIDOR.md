# Instrucciones para Mantener el Servidor Siempre Encendido

## Opción 1: Usando PM2 (Recomendado)

PM2 es un gestor de procesos que mantiene tu servidor corriendo incluso si se cierra la terminal o se reinicia la PC.

### Instalación de PM2

```bash
# Instalar PM2 globalmente
npm install -g pm2

# O instalar localmente en el proyecto
cd server
npm install pm2 --save-dev
```

### Iniciar el Servidor con PM2

```bash
# Desde la carpeta server
cd server
npm run pm2:start

# O directamente con PM2
pm2 start ecosystem.config.js
```

### Comandos Útiles de PM2

```bash
# Ver estado de los procesos
pm2 status

# Ver logs en tiempo real
npm run pm2:logs
# O directamente
pm2 logs wayira-api

# Reiniciar el servidor
npm run pm2:restart
# O directamente
pm2 restart wayira-api

# Detener el servidor
npm run pm2:stop
# O directamente
pm2 stop wayira-api

# Eliminar el proceso de PM2
npm run pm2:delete
# O directamente
pm2 delete wayira-api

# Guardar la configuración actual para que PM2 la restaure al reiniciar
pm2 save

# Configurar PM2 para iniciar automáticamente al arrancar el sistema
pm2 startup
```

### Configurar Auto-Inicio al Reiniciar la PC

1. Inicia el servidor con PM2:
```bash
cd server
pm2 start ecosystem.config.js
```

2. Guarda la configuración:
```bash
pm2 save
```

3. Configura el auto-inicio:
```bash
pm2 startup
```

Este comando te dará un comando específico para tu sistema. Cópialo y ejecútalo.

## Opción 2: Usando Windows Task Scheduler (Solo Windows)

1. Abre "Programador de tareas" (Task Scheduler)
2. Crea una tarea básica
3. Configura:
   - **Nombre**: Wayira API Server
   - **Desencadenador**: Al iniciar sesión
   - **Acción**: Iniciar un programa
   - **Programa**: `node`
   - **Argumentos**: `C:\ruta\a\tu\proyecto\server\server.js`
   - **Iniciar en**: `C:\ruta\a\tu\proyecto\server`

## Opción 3: Usando un Servicio de Windows (Solo Windows)

Puedes usar `node-windows` para crear un servicio de Windows:

```bash
npm install -g node-windows
cd server
node-windows-install
```

## Opción 4: Usando un Servidor en la Nube

Para mantener el servidor siempre encendido sin depender de tu PC, considera usar:

- **Railway**: https://railway.app
- **Heroku**: https://heroku.com
- **DigitalOcean**: https://digitalocean.com
- **AWS**: https://aws.amazon.com
- **Google Cloud**: https://cloud.google.com

## Verificación

Para verificar que el servidor está corriendo:

1. Abre tu navegador y ve a: `http://localhost:3001/health`
2. Deberías ver una respuesta JSON con el estado del servidor

## Notas Importantes

- **Puerto**: Asegúrate de que el puerto 3001 no esté siendo usado por otra aplicación
- **Variables de Entorno**: Crea un archivo `.env` en la carpeta `server` con:
  ```
  RIOT_API_KEY=RGAPI-1f276317-3a70-4dbd-8080-569e66a14e03
  PORT=3001
  ```
- **Logs**: Los logs se guardan en `server/logs/` cuando usas PM2
- **Reinicio Automático**: PM2 reiniciará automáticamente el servidor si se cae

## Solución de Problemas

### El servidor no inicia
- Verifica que Node.js esté instalado: `node --version`
- Verifica que las dependencias estén instaladas: `cd server && npm install`
- Revisa los logs: `pm2 logs wayira-api`

### El puerto está en uso
- Cambia el puerto en el archivo `.env` o `ecosystem.config.js`
- O detén el proceso que está usando el puerto

### PM2 no inicia automáticamente
- Ejecuta `pm2 startup` nuevamente
- Verifica que el comando se haya ejecutado correctamente
- En Windows, asegúrate de ejecutar como administrador

