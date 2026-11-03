import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.waitForInit();
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
  }
  return true;
};
