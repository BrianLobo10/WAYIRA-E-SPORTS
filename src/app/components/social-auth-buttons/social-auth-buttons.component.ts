import { Component, inject, input, signal } from '@angular/core';
import { AuthService, OAuthProvider } from '../../services/auth.service';

/** Botones de acceso con Google y Discord (únicos métodos de inicio de sesión de WAYIRA). */
@Component({
  selector: 'app-social-auth-buttons',
  standalone: true,
  template: `
    @if (error()) {
      <div class="social-auth__error" role="alert">{{ error() }}</div>
    }
    <div class="social-auth">
      <button type="button" class="social-auth__btn social-auth__btn--discord"
              (click)="go('discord')" [disabled]="loading() !== null" [attr.aria-busy]="loading() === 'discord'">
        @if (loading() === 'discord') {
          <span class="social-auth__spinner" aria-hidden="true"></span>
        } @else {
          <svg class="social-auth__icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="M20.32 4.37A19.8 19.8 0 0 0 15.4 2.85a.07.07 0 0 0-.08.04c-.21.38-.45.87-.61 1.25a18.3 18.3 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.92 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.29 1.23-1.99a.08.08 0 0 0-.04-.1 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13c.13-.09.25-.19.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01c.12.1.25.2.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.78 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42z"/>
          </svg>
        }
        <span>{{ verb() }} con Discord</span>
      </button>
      <button type="button" class="social-auth__btn social-auth__btn--google"
              (click)="go('google')" [disabled]="loading() !== null" [attr.aria-busy]="loading() === 'google'">
        @if (loading() === 'google') {
          <span class="social-auth__spinner" aria-hidden="true"></span>
        } @else {
          <svg class="social-auth__icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        }
        <span>{{ verb() }} con Google</span>
      </button>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .social-auth { display: flex; flex-direction: column; gap: 0.75rem; }
    .social-auth__btn {
      min-height: 52px; width: 100%; padding: 0 1rem; border: none; border-radius: var(--radius-sm, 10px);
      display: flex; align-items: center; justify-content: center; gap: 0.625rem;
      font: inherit; font-size: 1rem; font-weight: 600; cursor: pointer;
      transition: background-color 160ms var(--ease-out, ease), box-shadow 160ms var(--ease-out, ease), transform 160ms var(--ease-out, ease);
    }
    .social-auth__btn:active:not(:disabled) { transform: scale(0.96); }
    .social-auth__btn:disabled { opacity: 0.7; cursor: progress; }
    .social-auth__btn:focus-visible { outline: 2px solid var(--teal-accent, #01C4C4); outline-offset: 2px; }
    /* Mismo estilo que el botón principal del sitio (turquesa de WAYIRA) */
    .social-auth__btn--discord {
      background: var(--teal-pri, #016C6C); color: #FFFFFF;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 1px 2px rgba(0, 0, 0, 0.4);
    }
    @media (hover: hover) {
      .social-auth__btn--discord:hover:not(:disabled) {
        background: var(--teal-hover, #018888);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 6px 20px -6px rgba(1, 196, 196, 0.45);
      }
    }
    .social-auth__btn--google {
      background: rgba(237, 248, 248, 0.04); color: var(--white, #EDF8F8);
      box-shadow: inset 0 0 0 1px rgba(237, 248, 248, 0.14);
    }
    .social-auth__btn--google:hover:not(:disabled) {
      background: rgba(237, 248, 248, 0.08); box-shadow: inset 0 0 0 1px rgba(237, 248, 248, 0.24);
    }
    .social-auth__icon { flex-shrink: 0; }
    .social-auth__spinner {
      width: 1.125rem; height: 1.125rem; border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.3); border-top-color: #fff;
      animation: social-auth-spin 0.7s linear infinite; flex-shrink: 0;
    }
    .social-auth__error {
      margin-bottom: 0.75rem; padding: 0.75rem 1rem; border-radius: var(--radius-sm, 10px);
      background: rgba(255, 64, 85, 0.1); color: #FF8A97; font-size: 0.9375rem;
      box-shadow: inset 0 0 0 1px rgba(255, 64, 85, 0.3);
    }
    @keyframes social-auth-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) {
      .social-auth__btn { transition: none; }
      .social-auth__btn:active:not(:disabled) { transform: none; }
    }
  `],
})
export class SocialAuthButtonsComponent {
  /** Texto del verbo: "Entrar" en login, "Registrarme" en registro. */
  readonly verb = input('Entrar');
  /** Ruta a la que volver después de iniciar sesión. */
  readonly returnPath = input('/feed');
  /** Error recibido en la URL al volver del proveedor (por ejemplo, si el usuario canceló). */
  readonly initialError = input<string | null>(null);

  private readonly auth = inject(AuthService);
  readonly loading = signal<OAuthProvider | null>(null);
  readonly error = signal('');

  ngOnInit() {
    if (this.initialError()) this.error.set(this.initialError()!);
  }

  async go(provider: OAuthProvider) {
    this.error.set('');
    this.loading.set(provider);
    try {
      await this.auth.signIn(provider, this.returnPath());
      // El navegador se va a Google/Discord; si algo lo impide, se libera el botón
      setTimeout(() => this.loading.set(null), 8000);
    } catch {
      this.loading.set(null);
      this.error.set('No se pudo abrir el inicio de sesión. Intenta de nuevo.');
    }
  }
}
