import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { FirebaseService } from '../services/firebase.service';

export const adminGuard: CanActivateFn = async (route, state) => {
  const firebaseService = inject(FirebaseService);
  const router = inject(Router);
  
  const user = firebaseService.getCurrentUser();
  if (!user) {
    router.navigate(['/login']);
    return false;
  }
  
  const isAdmin = await firebaseService.isAdmin(user.uid);
  if (!isAdmin) {
    router.navigate(['/']);
    return false;
  }
  
  return true;
};

