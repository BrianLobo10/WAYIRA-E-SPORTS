import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { STAFF_LINKS } from './panel-shell.component';

const ROLE_NAMES: Record<string, string> = {
  'community.moderate': 'Moderación de la comunidad',
  'users.suspend': 'Suspender cuentas',
  'users.view': 'Ver usuarios',
  'site.manage': 'Configuración del sitio',
};

/** Portada del panel: qué puede hacer esta persona, en una mirada. */
@Component({
  selector: 'app-staff-home',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./admin-ui.css'],
  template: `
    <header class="view-head">
      <div>
        <p class="view-kicker">Panel de staff</p>
        <h1 class="view-title">Hola, {{ name() }}</h1>
        <p class="view-lead">Estas son las secciones de tu rol. Cada acción la vuelve a comprobar la base de datos y las importantes quedan registradas.</p>
      </div>
    </header>

    @if (links().length) {
      <ul class="grid">
        @for (l of links(); track l.path) {
          <li>
            <a class="tile" [routerLink]="l.path">
              <span class="material-icons tile__icon" aria-hidden="true">{{ l.icon }}</span>
              <span class="tile__label">{{ l.label }}</span>
              <span class="tile__hint">{{ l.hint }}</span>
            </a>
          </li>
        }
      </ul>
    } @else {
      <div class="panel empty">
        <strong>Tu rol aún no tiene secciones en este panel</strong>
        La moderación de publicaciones se hace desde el Feed. La cola de denuncias y suspensiones llega en la siguiente fase.
      </div>
    }

    @if (extra().length) {
      <p class="perms">También puedes: {{ extra().join(' · ') }}</p>
    }
  `,
  styles: [`
    .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
    .tile {
      display: flex; flex-direction: column; gap: 6px; height: 100%; box-sizing: border-box; padding: 18px;
      background: var(--surface-1); box-shadow: inset 0 0 0 1px var(--border); border-radius: 2px;
      color: inherit; text-decoration: none; transition: box-shadow 200ms var(--ease-out), background-color 200ms var(--ease-out);
    }
    .tile:hover { box-shadow: inset 0 0 0 1px var(--border-strong); background: var(--surface-2); }
    .tile:focus-visible { outline: 2px solid var(--volt); outline-offset: 2px; }
    .tile__icon { font-size: 22px; color: var(--volt); margin-bottom: 6px; }
    .tile__label { font-weight: 600; font-size: 16px; }
    .tile__hint { font-size: 13px; line-height: 1.5; color: var(--text-secondary); }
    .perms { margin-top: 20px; font-size: 13px; color: var(--text-muted); }
  `],
})
export class StaffHomeComponent {
  private readonly auth = inject(AuthService);
  readonly name = computed(() => this.auth.profile()?.display_name?.split(' ')[0] || 'equipo');
  readonly links = computed(() => STAFF_LINKS.filter((l) => this.auth.hasPermission(l.permission)));
  readonly extra = computed(() => Object.keys(ROLE_NAMES).filter((p) => this.auth.hasPermission(p)).map((p) => ROLE_NAMES[p]));
}
