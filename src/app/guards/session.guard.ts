import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
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
  const auth = inject(AuthService);
  const router = inject(Router);
  const storage = inject(SecureStorageService);

  await auth.waitForInit();

  if (!auth.isAuthenticated()) {
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
    if (safeInternalPath(decoded)) return decoded;
  }
  const stored = storage.getSession(RETURN_KEY);
  if (stored) {
    storage.removeSession(RETURN_KEY);
    return stored;
  }
  return '/feed';
}

/** Ruta interna segura (evita redirecciones a otros sitios). */
export function safeInternalPath(path: string | null | undefined): string | null {
  return path && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/login') && !path.startsWith('/register')
    ? path
    : null;
}
