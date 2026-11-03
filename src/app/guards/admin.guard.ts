import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Pantallas de staff. Uso: canActivate: [adminGuard], data: { permission: 'tournaments.manage' }.
 * Sin `permission`, basta cualquier permiso de staff. La seguridad real está en la base de datos (RLS).
 */
export const adminGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.waitForInit();
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  await auth.refreshProfile();
  const needed = route.data?.['permission'] as string | undefined;
  const allowed = needed ? auth.hasPermission(needed) : auth.permissions().length > 0;
  return allowed ? true : router.createUrlTree(['/']);
};
