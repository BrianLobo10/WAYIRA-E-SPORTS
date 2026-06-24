# Cómo aparecer como administrador (ver "Crear Torneo")

La opción **Crear Torneo** en el header solo se muestra si tu usuario tiene **role: 'admin'** en Firestore. Por defecto, al registrarte se guarda **role: 'user'**.

## Pasos en Firebase Console

1. Abre [Firebase Console](https://console.firebase.google.com/) y selecciona tu proyecto.
2. Ve a **Firestore Database**.
3. Abre la colección **users**.
4. Localiza el documento cuyo **ID** es tu UID de usuario (mismo que tu usuario de Firebase Auth).
   - Para saber tu UID: inicia sesión en la app, abre DevTools (F12) → pestaña Console; al cargar el header verás un mensaje como `Header: No admin. Para ver "Crear Torneo" pon role: "admin" en Firestore → users → <tu-uid>`.
   - O en Firebase Console → Authentication → Users: el "User UID" es el mismo que el ID del documento en `users`.
5. Abre ese documento y:
   - Si ya existe el campo **role**: cámbialo de `user` a **admin**.
   - Si no existe el campo **role**: añade un campo con nombre **role** y valor **admin** (tipo string).
6. Guarda. Recarga la app (o cierra sesión y vuelve a entrar); debería aparecer **Crear Torneo** en el menú.

## Comprobar en la app

- Abre la consola del navegador (F12). Si no eres admin verás:  
  `Header: No admin. Para ver "Crear Torneo" pon role: "admin" en Firestore → users → <uid>`.
- Tras poner **role: "admin"** en Firestore y recargar, ese mensaje no debería salir y el botón **Crear Torneo** será visible (junto a "Torneos" o dentro del menú en móvil).
