import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/** 403 (sin permiso) y 404 (no existe). Mismo marco, texto distinto. */
@Component({
  selector: 'app-error-page',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="err">
      <p class="err__code" aria-hidden="true">{{ code }}</p>
      <h1 class="err__title">{{ code === 403 ? 'Esta sección no es para tu rol' : 'Esta página no existe' }}</h1>
      <p class="err__text">
        @if (code === 403) {
          Tu cuenta no tiene el permiso que pide esta pantalla. Si crees que deberías tenerlo, pídeselo a un administrador.
        } @else {
          Puede que el enlace esté mal escrito o que la página se haya movido.
        }
      </p>
      <div class="err__actions">
        <a class="btn btn-primary" routerLink="/">Ir al inicio</a>
        @if (code === 403 && hasStaff()) { <a class="btn btn-secondary" routerLink="/staff">Ir a mi panel</a> }
        @if (code === 404) { <a class="btn btn-secondary" routerLink="/tournaments">Ver torneos</a> }
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; background: var(--bg); color: var(--white); }
    .err { max-width: 640px; margin: 0 auto; padding: clamp(64px, 12vh, 140px) var(--gutter); }
    .err__code { margin: 0; font-family: var(--font-score); font-weight: 700; font-size: clamp(96px, 18vw, 180px); line-height: .85; color: var(--volt); letter-spacing: -.02em; }
    .err__title { margin: 16px 0 12px; font-family: var(--font-display); font-weight: 400; font-size: clamp(2rem, 4.5vw, 3rem); line-height: 1.05; }
    .err__text { margin: 0; font-size: 16px; line-height: 1.6; color: var(--text-secondary); max-width: 52ch; }
    .err__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 28px; }
  `],
})
export class ErrorPageComponent {
  private readonly auth = inject(AuthService);
  readonly code: 403 | 404 = inject(ActivatedRoute).snapshot.data['code'] ?? 404;
  hasStaff() {
    return this.auth.permissions().length > 0;
  }
}
