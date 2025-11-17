# Guía de Despliegue a Firebase Hosting

## 🚀 Proceso de Despliegue

### Paso 1: Construir la Aplicación

Primero necesitas compilar la aplicación Angular para producción:

```bash
npm run build:prod
```

Esto creará los archivos optimizados en la carpeta `dist/WAYIRAE-SPORTS/browser/`

### Paso 2: Iniciar Sesión en Firebase (Solo la primera vez)

Si no has iniciado sesión en Firebase CLI:

```bash
firebase login
```

Esto abrirá tu navegador para autenticarte con tu cuenta de Google.

### Paso 3: Verificar el Proyecto

Asegúrate de estar usando el proyecto correcto:

```bash
firebase use wayirae-sports
```

### Paso 4: Desplegar a Firebase Hosting

Tienes dos opciones:

#### Opción A: Desplegar Todo (Recomendado)
```bash
npm run deploy
```

Este comando:
1. Construye la aplicación (`npm run build:prod`)
2. Despliega a Firebase Hosting (`firebase deploy`)

#### Opción B: Desplegar Solo Hosting
```bash
npm run deploy:hosting
```

Este comando:
1. Construye la aplicación (`npm run build:prod`)
2. Despliega solo el hosting (`firebase deploy --only hosting`)

### Paso 5: Verificar el Despliegue

Después del deploy, Firebase te mostrará la URL de tu sitio, algo como:
```
✔  Deploy complete!

Hosting URL: https://wayirae-sports.web.app
```

## 📋 Comandos Útiles

### Ver el estado del proyecto Firebase
```bash
firebase projects:list
```

### Ver qué está configurado
```bash
firebase use
```

### Ver el historial de deploys
```bash
firebase hosting:channel:list
```

### Desplegar a un canal de preview (para testing)
```bash
firebase hosting:channel:deploy preview
```

### Ver logs del hosting
```bash
firebase hosting:clone
```

## ⚙️ Configuración Actual

- **Proyecto**: `wayirae-sports`
- **Directorio de build**: `dist/WAYIRAE-SPORTS/browser`
- **Archivo de configuración**: `firebase.json`

## 🔄 Flujo de Trabajo Recomendado

1. **Desarrollo Local**:
   ```bash
   npm start
   ```
   Trabaja en `http://localhost:4200`

2. **Probar Build de Producción**:
   ```bash
   npm run build:prod
   ```
   Revisa que todo compile correctamente

3. **Desplegar**:
   ```bash
   npm run deploy
   ```
   Sube los cambios a Firebase Hosting

4. **Verificar**:
   Visita tu URL de Firebase Hosting para ver los cambios

## ⚠️ Notas Importantes

- **Backend**: El servidor backend (API de Riot Games) debe estar desplegado por separado
- **Variables de Entorno**: Asegúrate de que las variables de entorno estén configuradas en Firebase
- **Reglas de Firestore**: Verifica que las reglas de seguridad estén configuradas correctamente
- **Storage**: Asegúrate de que Firebase Storage esté habilitado y configurado

## 🐛 Solución de Problemas

### Error: "No authorized accounts"
```bash
firebase login
```

### Error: "Project not found"
```bash
firebase use wayirae-sports
```

### Error: "Build failed"
- Verifica que no haya errores de TypeScript: `npm start`
- Limpia el caché: `rm -rf .angular` (o en Windows: `Remove-Item -Recurse .angular`)

### Los cambios no se ven
- Espera unos minutos (puede tomar hasta 5 minutos para propagarse)
- Limpia la caché del navegador (Ctrl+Shift+R)
- Verifica que el build se completó correctamente

## 📝 Checklist Antes de Desplegar

- [ ] Todos los cambios están guardados
- [ ] La aplicación compila sin errores (`npm start`)
- [ ] El build de producción funciona (`npm run build:prod`)
- [ ] Las credenciales de Firebase están actualizadas
- [ ] Las reglas de Firestore están configuradas
- [ ] Firebase Storage está habilitado
- [ ] Has probado la aplicación localmente

