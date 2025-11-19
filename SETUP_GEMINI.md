# Configuración de Gemini API para POTATO 🤖🥔

## Pasos para configurar la IA de Gemini en Firebase Functions

### 1. Configurar el secreto de Gemini en Firebase

Ejecuta este comando para configurar la API key de Gemini en Firebase Functions:

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

Cuando te lo pida, ingresa tu API key:
```
AIzaSyAwmjZLerRPZ4d3G5Q5xYWWYAf_9NyfmEw
```

### 2. Desplegar las funciones actualizadas

```bash
npm run build:prod
firebase deploy --only functions
```

O si quieres desplegar todo:

```bash
npm run build:prod
npm run deploy:all
```

## Verificación

Después del despliegue, verifica que funciona:

1. Ve a la consola de Firebase: https://console.firebase.google.com
2. Ve a Functions
3. Busca la función `api`
4. Revisa los logs para confirmar que Gemini está configurado

## Resumen

✅ Código del chatbot agregado a `functions/index.js`
✅ Dependencia `@google/generative-ai` agregada a `functions/package.json`
✅ Secrets actualizados para incluir `GEMINI_API_KEY`

**IMPORTANTE**: Antes de desplegar, ejecuta:
```bash
firebase functions:secrets:set GEMINI_API_KEY
```

Y luego despliega:
```bash
npm run build:prod
npm run deploy:all
```

