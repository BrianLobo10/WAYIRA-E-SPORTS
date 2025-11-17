FROM node:18-alpine

WORKDIR /app

# Copiar archivos de configuración
COPY package*.json ./

# Instalar dependencias (solo producción)
RUN npm ci --only=production

# Copiar el código del servidor
COPY *.js ./

# Cloud Run usa el puerto de la variable PORT (por defecto 8080)
# El servidor ya está configurado para usar process.env.PORT
EXPOSE 8080

# Health check para Cloud Run
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const port = process.env.PORT || 8080; require('http').get('http://localhost:' + port + '/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Iniciar el servidor (Cloud Run inyecta PORT automáticamente)
CMD ["node", "server.js"]

