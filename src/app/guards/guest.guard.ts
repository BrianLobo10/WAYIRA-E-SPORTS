import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { FirebaseService } from '../services/firebase.service';
import { firstValueFrom, take } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

export const guestGuard: CanActivateFn = async (route, state) => {
  const firebaseService = inject(FirebaseService);
  const router = inject(Router);
  
  try {
    // Primero verificar síncronamente (puede estar disponible inmediatamente)
    const currentUser = firebaseService.getCurrentUser();
    if (currentUser) {
      router.navigate(['/']);
      return false;
    }
    
    // Si no hay usuario síncrono, esperar el primer valor del observable
    // con un timeout corto para evitar esperas innecesarias
    const user = await firstValueFrom(
      firebaseService.currentUser.pipe(
        take(1),
        timeout(1000),
        catchError(() => of(null))
      )
    );
    
    if (user) {
      router.navigate(['/']);
      return false;
    }
    return true;
  } catch (error) {
    // Si hay error, verificar síncronamente como fallback
    const user = firebaseService.getCurrentUser();
    if (user) {
      router.navigate(['/']);
      return false;
    }
    return true;
  }
};

