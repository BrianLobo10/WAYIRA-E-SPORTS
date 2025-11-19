import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { FirebaseService } from '../services/firebase.service';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { of } from 'rxjs';

export const authGuard: CanActivateFn = async (route, state) => {
  const firebaseService = inject(FirebaseService);
  const router = inject(Router);
  
  // Primero verificar síncronamente (puede estar disponible inmediatamente)
  let user = firebaseService.getCurrentUser();
  
  // Si no hay usuario síncrono, esperar a que Firebase Auth se inicialice
  // (máximo 3 segundos para evitar esperas infinitas)
  if (!user) {
    try {
      user = await firstValueFrom(
        firebaseService.currentUser.pipe(
          timeout(3000),
          catchError(() => of(null))
        )
      );
    } catch (error) {
      // Si hay error, verificar síncronamente como fallback
      user = firebaseService.getCurrentUser();
    }
  }
  
  if (!user) {
    // Guardar la URL a la que intentaba acceder para redirigir después del login
    router.navigate(['/login'], { 
      queryParams: { returnUrl: state.url } 
    });
    return false;
  }
  
  return true;
};

