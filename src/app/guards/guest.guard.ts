import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { FirebaseService } from '../services/firebase.service';

export const guestGuard: CanActivateFn = async (route, state) => {
  const firebaseService = inject(FirebaseService);
  const router = inject(Router);

  // Esperar a que Firebase Auth emita el primer estado (evita mostrar login y luego redirigir)
  await firebaseService.waitForAuthInit(3000);
  const user = firebaseService.getCurrentUser();

  if (user) {
    router.navigate(['/']);
    return false;
  }
  return true;
};

