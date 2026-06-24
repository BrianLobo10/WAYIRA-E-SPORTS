# Seguridad, minificación y protección de rutas

## Minificación (producción)

- **`ng build --configuration=production`** (o `npm run build:prod`):
  - `optimization: { scripts: true, styles: true }`: minificación de JS y CSS.
  - `sourceMap: false`: no se generan source maps (el código ofuscado no se puede depurar fácilmente).
  - `outputHashing: "all"`: nombres de archivos con hash para cache y ofuscación.
  - `namedChunks: false`: chunks sin nombres legibles.

## Protección de rutas

- **sessionGuard**: rutas que requieren login (feed, profile, messages, contact, explore, blog/post).
  - Si no hay usuario → redirección a `/login` con **returnUrl ofuscado** en query (`?r=...`), no se expone la ruta en claro.
  - La URL de retorno se guarda también en sessionStorage (ofuscada) por si se pierde el query.
- **guestGuard**: solo para `/login` y `/register` (si ya hay sesión, redirige a home).
- **adminGuard**: para rutas de administración (comprobar rol admin).

## Ofuscación / “encriptación” en cliente

- **SecureStorageService**: ofuscación ligera (prefijo + base64) para datos en `sessionStorage`/`localStorage`.  
  No es cifrado criptográfico; evita lectura casual. No guardar contraseñas ni tokens secretos en el cliente.
- **ReturnUrl**: al redirigir a login se usa query `r` codificado en base64 en lugar de `returnUrl` en claro.
- **Firebase config**: leída desde `environment` (`environment.ts` / `environment.prod.ts`).  
  En producción se puede inyectar desde variables de entorno en el build si se genera `environment.prod.ts` por CI.
- **HTTPS**: en producción es obligatorio; Firebase y las APIs deben servirse por HTTPS.

## Resumen de rutas protegidas

| Ruta            | Guard        |
|-----------------|-------------|
| /feed, /profile, /profile/:id, /messages, /contact, /explore, /blog/post/:id | sessionGuard |
| /login, /register | guestGuard  |
| Resto (home, search, roulette, about, news, tournaments) | público     |
