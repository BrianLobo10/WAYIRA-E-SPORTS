import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SecureStorageService } from '../services/secure-storage.service';
import { getStoredReturnUrl, safeInternalPath } from './session.guard';

/** Login y registro solo sin sesión. Al volver de Google/Discord ya con sesión, lleva a donde iba el usuario. */
export const guestGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const storage = inject(SecureStorageService);

  await auth.waitForInit();
  if (auth.isAuthenticated()) {
    const next = safeInternalPath(route.queryParamMap.get('next'))
      ?? getStoredReturnUrl(route.queryParamMap.get('r'), storage);
    return router.parseUrl(next);
  }
  return true;
};
