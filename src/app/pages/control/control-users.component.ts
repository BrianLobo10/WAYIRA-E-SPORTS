import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService, type AdminUser, type Suspension } from '../../services/admin.service';
import { AuthService } from '../../services/auth.service';
import { ContentService, type RoleInfo } from '../../services/content.service';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';

type Mode = 'role' | 'suspend' | 'email' | 'history';

const PERMISSION_LABELS: Record<string, string> = {
  'community.moderate': 'Moderar la comunidad',
  'users.suspend': 'Suspender cuentas',
  'users.view': 'Ver listado de usuarios',
  'users.view_email': 'Ver correos (con motivo)',
  'news.manage': 'Gestionar noticias',
  'site.content': 'Editar contenido del sitio',
  'site.manage': 'Configurar el sitio',
  'tournaments.manage': 'Gestionar torneos',
  'giveaways.manage': 'Gestionar sorteos',
  'contact.read': 'Leer el buzón',
  'roles.assign': 'Asignar roles',
  'audit.view': 'Ver la auditoría',
  'platform.stats': 'Ver estadísticas',
};

const DURATIONS = [
  { hours: 1, label: '1 hora' },
  { hours: 24, label: '24 horas' },
  { hours: 72, label: '3 días' },
  { hours: 168, label: '7 días' },
  { hours: 720, label: '30 días' },
  { hours: 0, label: 'Indefinida' },
];

/**
 * Usuarios del centro de control. Cambiar roles y suspender pide motivo y confirmación;
 * la base comprueba rango y permiso y registra tanto lo hecho como lo rechazado.
 */
@Component({
  selector: 'app-control-users',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../staff/admin-ui.css'],
  templateUrl: './control-users.component.html',
  styles: [`
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .change { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; padding: 14px; border-radius: 2px; background: var(--bg); box-shadow: inset 0 0 0 1px var(--border); }
    .change__side { display: flex; flex-direction: column; gap: 4px; }
    .change__label { font-family: var(--font-mono); font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--text-muted); }
    .change__role { font-weight: 600; }
    .change__arrow { color: var(--text-muted); }
    .perm-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
    .perm-list li::before { content: attr(data-sign); display: inline-block; width: 16px; font-family: var(--font-mono); }
    .perm-gain { color: var(--volt); }
    .perm-lose { color: var(--ember-text); }
    .durations { display: flex; flex-wrap: wrap; gap: 6px; }
    .history { list-style: none; margin: 0; padding: 0; font-size: 13px; }
    .history li { padding: 10px 0; border-bottom: 1px solid var(--border-subtle); }
    .history li:last-child { border-bottom: 0; }
    .email-value { font-family: var(--font-mono); font-size: 15px; padding: 12px; background: var(--bg); border-radius: 2px; box-shadow: inset 0 0 0 1px var(--border); user-select: all; }
    td .who { max-width: 260px; }
  `],
})
export class ControlUsersComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly content = inject(ContentService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private readonly sheet = viewChild.required<ElementRef<HTMLDialogElement>>('sheet');

  readonly durations = DURATIONS;
  readonly users = signal<AdminUser[]>([]);
  readonly roles = signal<RoleInfo[]>([]);
  readonly perms = signal<Record<string, string[]>>({});
  readonly myRank = signal(0);
  readonly myId = computed(() => this.auth.user()?.id ?? null);
  readonly canEmail = computed(() => this.auth.hasPermission('users.view_email'));
  readonly canRoles = computed(() => this.auth.hasPermission('roles.assign'));
  readonly canSuspend = computed(() => this.auth.hasPermission('users.suspend'));

  readonly search = signal('');
  readonly roleFilter = signal('');
  readonly loading = signal(true);
  private timer: ReturnType<typeof setTimeout> | null = null;

  // Diálogo
  readonly mode = signal<Mode>('role');
  readonly target = signal<AdminUser | null>(null);
  readonly newRole = signal('user');
  readonly reason = signal('');
  readonly hours = signal(24);
  readonly busy = signal(false);
  readonly email = signal<string | null>(null);
  readonly history = signal<Suspension[]>([]);
  readonly touched = signal(false);

  /** Roles que puedo dar: los de rango inferior al mío (la base aplica la misma regla) */
  readonly grantable = computed(() => this.roles().filter((r) => r.rank < this.myRank()));
  readonly currentRole = computed(() => this.primaryRole(this.target()));
  readonly permDiff = computed(() => {
    const t = this.target();
    if (!t) return { gain: [] as string[], lose: [] as string[] };
    const before = new Set(t.roles.flatMap((r) => this.perms()[r] ?? []));
    const keep = t.roles.filter((r) => this.rankOf(r) >= this.myRank()); // roles que no puedo tocar se quedan
    const after = new Set([...keep, ...(this.newRole() === 'user' ? [] : [this.newRole()])].flatMap((r) => this.perms()[r] ?? []));
    return {
      gain: [...after].filter((p) => !before.has(p)).map((p) => PERMISSION_LABELS[p] ?? p),
      lose: [...before].filter((p) => !after.has(p)).map((p) => PERMISSION_LABELS[p] ?? p),
    };
  });
  readonly reasonMin = computed(() => (this.mode() === 'email' ? 10 : 5));
  readonly reasonOk = computed(() => this.reason().trim().length >= this.reasonMin());

  async ngOnInit() {
    await this.auth.waitForInit();
    try {
      const [roles, perms, rank] = await Promise.all([this.content.getRoles(), this.admin.rolePermissions(), this.admin.myRank()]);
      this.roles.set(roles);
      this.perms.set(perms);
      this.myRank.set(rank);
    } catch (e) {
      this.toast.error('No se pudieron cargar los roles', e instanceof Error ? e.message : undefined);
    }
    await this.load();
  }

  onSearch(v: string) {
    this.search.set(v);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), 300);
  }

  async load() {
    this.loading.set(true);
    try {
      this.users.set(await this.admin.listUsers(this.search(), this.roleFilter()));
    } catch (e) {
      this.toast.error('No se pudo cargar el listado', e instanceof Error ? e.message : undefined);
    } finally {
      this.loading.set(false);
    }
  }

  rankOf(key: string): number {
    return this.roles().find((r) => r.key === key)?.rank ?? 0;
  }

  roleName(key: string): string {
    return key === 'user' ? 'Usuario' : (this.roles().find((r) => r.key === key)?.name ?? key);
  }

  primaryRole(u: AdminUser | null): string {
    if (!u || !u.roles.length) return 'user';
    return [...u.roles].sort((a, b) => this.rankOf(b) - this.rankOf(a))[0];
  }

  /** Solo se puede actuar sobre otras personas de rango inferior (igual que en la base) */
  manageable(u: AdminUser): boolean {
    return u.id !== this.myId() && u.maxRank < this.myRank();
  }

  open(mode: Mode, u: AdminUser) {
    this.mode.set(mode);
    this.target.set(u);
    this.reason.set('');
    this.touched.set(false);
    this.email.set(null);
    this.hours.set(24);
    this.newRole.set(this.primaryRole(u));
    if (mode === 'history') void this.admin.suspensions(u.id).then((h) => this.history.set(h)).catch(() => this.history.set([]));
    this.sheet().nativeElement.showModal();
  }

  close() {
    if (!this.busy()) this.sheet().nativeElement.close();
  }

  async confirmRole() {
    this.touched.set(true);
    const u = this.target();
    if (!u || !this.reasonOk() || this.newRole() === this.currentRole()) return;
    this.busy.set(true);
    const reason = this.reason().trim();
    try {
      const wanted = this.newRole();
      if (wanted !== 'user' && !u.roles.includes(wanted)) await this.content.assignRole(u.id, wanted, reason);
      for (const r of u.roles) {
        if (r !== wanted && this.rankOf(r) < this.myRank()) await this.content.revokeRole(u.id, r, reason);
      }
      this.toast.success('Rol actualizado', `${u.displayName}: ${this.roleName(this.currentRole())} → ${this.roleName(wanted)}`);
      this.sheet().nativeElement.close();
      await this.load();
    } catch (e) {
      this.toast.error('No se cambió el rol', e instanceof Error ? e.message : undefined);
      await this.load();
    } finally {
      this.busy.set(false);
    }
  }

  async confirmSuspend() {
    this.touched.set(true);
    const u = this.target();
    if (!u || !this.reasonOk()) return;
    this.busy.set(true);
    try {
      await this.admin.suspend(u.id, this.hours() || null, this.reason().trim());
      const d = this.durations.find((x) => x.hours === this.hours())?.label ?? '';
      this.toast.success('Cuenta suspendida', `${u.displayName} · ${d}`);
      this.sheet().nativeElement.close();
      await this.load();
    } catch (e) {
      this.toast.error('No se suspendió', e instanceof Error ? e.message : undefined);
    } finally {
      this.busy.set(false);
    }
  }

  async lift(u: AdminUser) {
    const ok = await this.dialog.confirm({
      kicker: 'Suspensión',
      title: `¿Reactivar a ${u.displayName}?`,
      message: 'Podrá volver a publicar, comentar e inscribirse desde ya.',
      confirmLabel: 'Reactivar cuenta',
    });
    if (!ok) return;
    try {
      await this.admin.liftSuspension(u.id, 'Reactivada desde el centro de control');
      this.toast.success('Cuenta reactivada', u.displayName);
      await this.load();
    } catch (e) {
      this.toast.error('No se reactivó', e instanceof Error ? e.message : undefined);
    }
  }

  async revealEmail() {
    this.touched.set(true);
    const u = this.target();
    if (!u || !this.reasonOk()) return;
    this.busy.set(true);
    try {
      this.email.set(await this.content.getUserEmail(u.id, this.reason().trim()));
    } catch (e) {
      this.toast.error('No se pudo consultar el correo', e instanceof Error ? e.message : undefined);
    } finally {
      this.busy.set(false);
    }
  }

  async copyEmail() {
    const e = this.email();
    if (!e) return;
    try {
      await navigator.clipboard.writeText(e);
      this.toast.success('Correo copiado');
    } catch {
      this.toast.info('Selecciona el correo y cópialo manualmente');
    }
  }

  providerLabel(p: string | null): string {
    return p === 'google' ? 'Google' : p === 'discord' ? 'Discord' : (p ?? '—');
  }
}
