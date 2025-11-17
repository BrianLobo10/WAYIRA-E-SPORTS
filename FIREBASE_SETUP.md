# Configuración de Firebase para Autenticación con Riot Games

## Pasos para Configurar Firebase

### 1. Crear Proyecto en Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Haz clic en "Agregar proyecto"
3. Ingresa el nombre del proyecto: "Wayira Esports"
4. Sigue los pasos para crear el proyecto

### 2. Configurar Autenticación

1. En el panel de Firebase, ve a "Authentication"
2. Haz clic en "Get started"
3. Habilita "Email/Password" como método de autenticación
4. Opcionalmente, habilita otros proveedores si lo deseas

### 3. Obtener Configuración de Firebase

1. Ve a "Project Settings" (ícono de engranaje)
2. En "Your apps", selecciona "Web" (</>)
3. Registra la app con un nombre (ej: "Wayira Esports Web")
4. Copia la configuración de Firebase que se muestra

### 4. Configurar Variables de Entorno

Crea un archivo `src/environments/firebase.config.ts` con tu configuración:

```typescript
export const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROJECT_ID.firebaseapp.com",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_PROJECT_ID.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};
```

### 5. Instalar Dependencias

```bash
npm install @angular/fire firebase
```

## Autenticación con Riot Games

La autenticación funciona de la siguiente manera:

1. El usuario ingresa su nombre de invocador de Riot Games
2. El sistema verifica que el invocador existe usando la API de Riot Games
3. Si el invocador existe, se crea/actualiza la cuenta en Firebase
4. El usuario queda autenticado con su cuenta de Riot Games vinculada

## Notas de Seguridad

- Nunca expongas tu API key de Firebase en el código del cliente
- Usa reglas de seguridad de Firebase para proteger los datos
- Valida siempre los datos del lado del servidor
- Implementa rate limiting para prevenir abusos

