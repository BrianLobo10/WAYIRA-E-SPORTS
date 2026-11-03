import { Injectable, computed, inject, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

export type OAuthProvider = 'google' | 'discord';

/** Perfil público (tabla profiles). Sin correo ni teléfono: esos viven solo en Supabase Auth. */
export interface Profile {
  id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  riot_game_name: string | null;
  riot_tag_line: string | null;
  riot_region: string | null;
  riot_verified: boolean;
}

const PROFILE_COLUMNS =
  'id, username, display_name, avatar_url, cover_url, bio, riot_game_name, riot_tag_line, riot_region, riot_verified';

/**
 * Sesión y perfil del usuario con Supabase Auth (solo Google y Discord).
 * Los permisos sirven para mostrar u ocultar botones; quien decide de verdad es la base de datos (RLS).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sb = inject(SupabaseService).client;

  readonly session = signal<Session | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly permissions = signal<string[]>([]);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => !!this.session());

  private readonly ready: Promise<void>;

  constructor() {
    this.ready = this.sb.auth.getSession().then(({ data }) => this.applySession(data.session));
    this.sb.auth.onAuthStateChange((event, session) => {
      // Las consultas se hacen fuera del callback para no bloquear al cliente de Supabase
      setTimeout(() => {
        if (event === 'TOKEN_REFRESHED' && session?.user.id === this.session()?.user.id) {
          this.session.set(session);
          return;
        }
        void this.applySession(session);
      }, 0);
    });
  }

  /** Espera a conocer si hay sesión (también procesa el regreso desde Google/Discord). */
  waitForInit(timeoutMs = 4000): Promise<void> {
    return Promise.race([this.ready, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
  }

  hasPermission(permission: string): boolean {
    return this.permissions().includes(permission);
  }

  /** Abre el inicio de sesión de Google o Discord. Al volver, Supabase crea la sesión y el perfil. */
  async signIn(provider: OAuthProvider, returnPath = '/feed'): Promise<void> {
    const safePath = returnPath.startsWith('/') && !returnPath.startsWith('//') ? returnPath : '/feed';
    const redirectTo = `${window.location.origin}/login?next=${encodeURIComponent(safePath)}`;
    const { error } = await this.sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo, scopes: provider === 'discord' ? 'identify email' : undefined },
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
    await this.applySession(null);
  }

  async refreshProfile(): Promise<void> {
    const id = this.session()?.user.id;
    if (!id) return;
    const [{ data: profile }, { data: perms }] = await Promise.all([
      this.sb.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle(),
      this.sb.rpc('my_permissions'),
    ]);
    if (this.session()?.user.id !== id) return; // cambió la sesión mientras cargaba
    this.profile.set((profile as Profile | null) ?? null);
    this.permissions.set(Array.isArray(perms) ? (perms as string[]) : []);
  }

  private async applySession(session: Session | null): Promise<void> {
    this.session.set(session);
    if (!session) {
      this.profile.set(null);
      this.permissions.set([]);
      return;
    }
    try {
      await this.refreshProfile();
    } catch (err) {
      console.error('No se pudo cargar el perfil', err);
    }
  }
}
