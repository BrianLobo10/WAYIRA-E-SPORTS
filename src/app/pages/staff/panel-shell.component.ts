import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../services/auth.service';

export interface PanelLink {
  path: string;
  label: string;
  icon: string;
  /** Permiso exacto que pide la ruta (el mismo que revisa adminGuard y la base) */
  permission: string;
  hint: string;
}

/** Secciones del panel de staff: cada persona ve solo las que su rol permite. */
export const STAFF_LINKS: PanelLink[] = [
  { path: 'proyectos', label: 'Proyectos', icon: 'rocket_launch', permission: 'site.content', hint: 'Crear, editar, ordenar y activar los proyectos de la web.' },
  { path: 'noticias', label: 'Noticias', icon: 'newspaper', permission: 'news.manage', hint: 'Publicar, despublicar y retirar noticias.' },
  { path: 'torneos', label: 'Torneos', icon: 'emoji_events', permission: 'tournaments.manage', hint: 'Estado, inscripciones y acceso al bracket.' },
  { path: 'sorteos', label: 'Sorteos', icon: 'casino', permission: 'giveaways.manage', hint: 'Sorteos oficiales: participantes y ganadores.' },
  { path: 'buzon', label: 'Buzón', icon: 'inbox', permission: 'contact.read', hint: 'Mensajes del formulario de contacto.' },
  { path: 'roles', label: 'Roles', icon: 'badge', permission: 'roles.assign', hint: 'Asignar y retirar roles inferiores al tuyo.' },
];

export const CONTROL_LINKS: PanelLink[] = [
  { path: 'resumen', label: 'Resumen', icon: 'insights', permission: 'platform.stats', hint: 'Estadísticas de la plataforma.' },
  { path: 'usuarios', label: 'Usuarios', icon: 'group', permission: 'users.view', hint: 'Roles, suspensiones y correos.' },
  { path: 'apariencia', label: 'Apariencia', icon: 'palette', permission: 'site.theme', hint: 'Colores de la web.' },
  { path: 'auditoria', label: 'Auditoría', icon: 'history', permission: 'audit.view', hint: 'Quién hizo qué, incluidos intentos rechazados.' },
];

/**
 * Marco de /staff y /control: menú lateral filtrado por permisos + la sección activa.
 * Ocultar un enlace no es la seguridad: cada ruta tiene su guard y la base revisa cada acción.
 */
@Component({
  selector: 'app-panel-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell" [class.shell--control]="area === 'control'">
      <aside class="side" [attr.aria-label]="area === 'control' ? 'Centro de control' : 'Panel de staff'">
        <a class="side__brand" [routerLink]="'/' + area">
          <span class="side__kicker">{{ area === 'control' ? 'Superadmin' : 'Solo staff' }}</span>
          <span class="side__title">{{ area === 'control' ? 'Centro de control' : 'Panel de staff' }}</span>
        </a>
        <nav class="side__nav">
          @for (l of links(); track l.path) {
            <a class="side__link" [routerLink]="l.path" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: false }">
              <span class="material-icons" aria-hidden="true">{{ l.icon }}</span>{{ l.label }}
            </a>
          }
        </nav>
        <div class="side__foot">
          @if (area === 'staff' && canControl()) {
            <a class="side__link side__link--alt" routerLink="/control"><span class="material-icons" aria-hidden="true">shield</span>Centro de control</a>
          }
          @if (area === 'control') {
            <a class="side__link side__link--alt" routerLink="/staff"><span class="material-icons" aria-hidden="true">dashboard</span>Panel de staff</a>
          }
          <a class="side__link side__link--alt" routerLink="/"><span class="material-icons" aria-hidden="true">arrow_back</span>Volver a la web</a>
        </div>
      </aside>
      <main class="content" id="panel-main">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    :host { display: block; background: var(--bg); color: var(--white); }
    .shell { display: grid; grid-template-columns: 232px minmax(0, 1fr); min-height: calc(100vh - var(--header-h)); }
    .side {
      position: sticky; top: var(--header-h); align-self: start; height: calc(100vh - var(--header-h));
      display: flex; flex-direction: column; gap: 16px; padding: 24px 12px; box-sizing: border-box;
      border-right: 1px solid var(--border); overflow-y: auto;
    }
    .side__brand { display: flex; flex-direction: column; gap: 4px; padding: 0 12px 8px; text-decoration: none; color: inherit; }
    .side__kicker { font-family: var(--font-mono); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--text-secondary); }
    .shell--control .side__kicker { color: var(--ember-text); }
    .side__title { font-family: var(--font-display); font-size: 22px; line-height: 1.1; }
    .side__nav, .side__foot { display: flex; flex-direction: column; gap: 2px; }
    .side__foot { margin-top: auto; padding-top: 12px; border-top: 1px solid var(--border); }
    .side__link {
      display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 12px; border-radius: 2px;
      color: var(--text-secondary); text-decoration: none; font-size: 14px; font-weight: 500;
      transition: background-color 200ms var(--ease-out), color 200ms var(--ease-out);
    }
    .side__link .material-icons { font-size: 18px; }
    .side__link:hover { color: var(--white); background: rgba(255,255,255,.05); }
    .side__link.is-active { color: var(--volt-ink); background: var(--volt); }
    .shell--control .side__link.is-active { background: var(--white); }
    .side__link--alt { font-size: 13px; }
    .side__link:focus-visible { outline: 2px solid var(--volt); outline-offset: 2px; }
    .content { padding: 32px var(--gutter) 64px; min-width: 0; max-width: 1180px; box-sizing: border-box; }

    @media (max-width: 900px) {
      .shell { grid-template-columns: minmax(0, 1fr); }
      .side {
        position: sticky; top: var(--header-h); z-index: 5; height: auto; flex-direction: row; align-items: center;
        gap: 8px; padding: 8px var(--gutter); border-right: 0; border-bottom: 1px solid var(--border);
        background: var(--bg); overflow-x: auto; scrollbar-width: none;
      }
      .side::-webkit-scrollbar { display: none; }
      .side__brand { display: none; }
      .side__nav, .side__foot { flex-direction: row; gap: 4px; }
      .side__foot { margin: 0; padding: 0 0 0 8px; border-top: 0; border-left: 1px solid var(--border); }
      .side__link { white-space: nowrap; min-height: 40px; }
      .content { padding-top: 20px; }
    }
  `],
})
export class PanelShellComponent {
  private readonly auth = inject(AuthService);
  readonly area: 'staff' | 'control' = inject(ActivatedRoute).snapshot.data['area'] ?? 'staff';
  readonly canControl = computed(() => this.auth.hasPermission('platform.stats'));
  readonly links = computed(() =>
    (this.area === 'control' ? CONTROL_LINKS : STAFF_LINKS).filter((l) => this.auth.hasPermission(l.permission)),
  );
}
