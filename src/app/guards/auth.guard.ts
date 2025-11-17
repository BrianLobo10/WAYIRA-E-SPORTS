import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { FirebaseService } from '../services/firebase.service';

export const authGuard: CanActivateFn = async (route, state) => {
  const firebaseService = inject(FirebaseService);
  const router = inject(Router);
  
  const user = firebaseService.getCurrentUser();
  if (!user) {
    router.navigate(['/login']);
    return false;
  }
  return true;
};

