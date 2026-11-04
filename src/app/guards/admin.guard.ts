import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Pantallas de staff. Uso: canActivate: [adminGuard], data: { permission: 'tournaments.manage' }.
 * Sin `permission`, basta cualquier permiso de staff. La seguridad real está en la base de datos (RLS);
 * esto solo evita mostrar pantallas que la base de datos rechazaría.
 * Sin sesión → /login (y vuelve después). Con sesión pero sin permiso → /403.
 */
export const adminGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.waitForInit();
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
  // Reutiliza los permisos si se cargaron hace menos de un minuto (antes: 2 viajes a la base por clic)
  await auth.ensureFresh();
  const needed = route.data?.['permission'] as string | undefined;
  const allowed = needed ? auth.hasPermission(needed) : auth.permissions().length > 0;
  return allowed ? true : router.createUrlTree(['/403']);
};
