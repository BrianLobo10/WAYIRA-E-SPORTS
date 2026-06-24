import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { FirebaseService } from '../services/firebase.service';
import { SecureStorageService } from '../services/secure-storage.service';

const RETURN_KEY = 'returnUrl';

function encodeReturnUrl(url: string): string {
  try {
    return btoa(encodeURIComponent(url));
  } catch {
    return '';
  }
}

function decodeReturnUrl(encoded: string): string {
  try {
    return decodeURIComponent(atob(encoded));
  } catch {
    return '/';
  }
}

/**
 * Guard que exige usuario autenticado y sesión válida.
 * Redirige a login con returnUrl ofuscado en query (no se expone la ruta en claro).
 */
export const sessionGuard: CanActivateFn = async (route, state) => {
  const firebase = inject(FirebaseService);
  const router = inject(Router);
  const storage = inject(SecureStorageService);

  await firebase.waitForAuthInit(3000);
  const user = firebase.getCurrentUser();

  if (!user) {
    const url = state.url && state.url !== '/' ? state.url : '/feed';
    storage.setSession(RETURN_KEY, url);
    router.navigate(['/login'], {
      queryParams: { r: encodeReturnUrl(url) }
    });
    return false;
  }

  return true;
};

export function getStoredReturnUrl(routeQueryParamR: string | null, storage: SecureStorageService): string {
  if (routeQueryParamR) {
    const decoded = decodeReturnUrl(routeQueryParamR);
    if (decoded && decoded.startsWith('/')) return decoded;
  }
  const stored = storage.getSession(RETURN_KEY);
  if (stored) {
    storage.removeSession(RETURN_KEY);
    return stored;
  }
  return '/feed';
}
