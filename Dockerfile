FROM node:18-alpine

WORKDIR /app

# Copiar solo los archivos del servidor
COPY server/package*.json ./

# Instalar dependencias (solo producción, sin devDependencies)
RUN npm ci --omit=dev

# Copiar el código del servidor
COPY server/server.js ./
COPY server/start-with-ngrok.js ./

# Exponer el puerto
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Iniciar el servidor (usa el script del package.json copiado)
CMD ["node", "server.js"]

