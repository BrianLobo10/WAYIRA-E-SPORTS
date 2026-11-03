import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ContentService, type ContactRow, type RoleInfo, type StaffUser } from '../../services/content.service';

type Tab = 'buzon' | 'roles';

/**
 * Panel de staff: buzón de contacto y asignación de roles.
 * Cada sección aparece solo si la persona tiene el permiso; la base de datos vuelve a comprobarlo todo.
 */
@Component({
  selector: 'app-staff',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './staff.component.html',
  styleUrl: './staff.component.css',
})
export class StaffComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly content = inject(ContentService);

  readonly canReadInbox = computed(() => this.auth.hasPermission('contact.read'));
  readonly canAssignRoles = computed(() => this.auth.hasPermission('roles.assign'));
  readonly canViewEmails = computed(() => this.auth.hasPermission('users.view_email'));
  readonly tab = signal<Tab>('buzon');
  readonly myId = computed(() => this.auth.user()?.id ?? null);

  // Buzón
  readonly messages = signal<ContactRow[]>([]);
  readonly loadingInbox = signal(false);
  readonly inboxFilter = signal<'todos' | 'sin-leer'>('sin-leer');
  readonly openMessageId = signal<string | null>(null);
  readonly unreadCount = computed(() => this.messages().filter((m) => !m.read).length);
  readonly visibleMessages = computed(() =>
    // El mensaje abierto se queda visible aunque ya esté leído
    this.inboxFilter() === 'sin-leer' ? this.messages().filter((m) => !m.read || m.id === this.openMessageId()) : this.messages()
  );

  // Roles
  readonly roles = signal<RoleInfo[]>([]);
  readonly users = signal<StaffUser[]>([]);
  readonly search = signal('');
  readonly loadingUsers = signal(false);
  readonly busyUser = signal<string | null>(null);
  readonly assignable = computed(() => this.roles().filter((r) => r.key !== 'superadmin'));
  readonly emailShown = signal<{ userId: string; email: string } | null>(null);
  readonly emailReasonFor = signal<string | null>(null);
  readonly emailReason = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit() {
    await this.auth.waitForInit();
    if (!this.canReadInbox() && this.canAssignRoles()) this.tab.set('roles');
    if (this.canReadInbox()) void this.loadInbox();
    if (this.canAssignRoles()) {
      void this.content.getRoles().then((r) => this.roles.set(r));
      void this.loadUsers();
    }
  }

  // ---------------------------------------------------------------------------
  // Buzón
  // ---------------------------------------------------------------------------

  async loadInbox() {
    this.loadingInbox.set(true);
    try {
      this.messages.set(await this.content.getContactMessages());
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo cargar el buzón.');
    } finally {
      this.loadingInbox.set(false);
    }
  }

  async toggleMessage(m: ContactRow) {
    const opening = this.openMessageId() !== m.id;
    this.openMessageId.set(opening ? m.id : null);
    if (opening && !m.read) await this.setRead(m, true);
  }

  async setRead(m: ContactRow, read: boolean) {
    this.messages.update((list) => list.map((x) => (x.id === m.id ? { ...x, read } : x)));
    try {
      await this.content.setContactRead(m.id, read);
    } catch (err) {
      this.messages.update((list) => list.map((x) => (x.id === m.id ? { ...x, read: !read } : x)));
      alert(err instanceof Error ? err.message : 'No se pudo actualizar el mensaje.');
    }
  }

  async deleteMessage(m: ContactRow) {
    if (!confirm(`¿Eliminar el mensaje de ${m.name}?`)) return;
    try {
      await this.content.deleteContactMessage(m.id);
      this.messages.update((list) => list.filter((x) => x.id !== m.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar el mensaje.');
    }
  }

  replyLink(m: ContactRow): string {
    const subject = encodeURIComponent(`Re: ${m.subject || 'Tu mensaje a WAYIRA E-SPORTS'}`);
    return `mailto:${m.email}?subject=${subject}`;
  }

  typeLabel(t: string): string {
    return ({ general: 'Consulta general', support: 'Soporte técnico', other: 'Otro' } as Record<string, string>)[t] ?? t;
  }

  // ---------------------------------------------------------------------------
  // Roles
  // ---------------------------------------------------------------------------

  onSearch(value: string) {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.loadUsers(), 300);
  }

  async loadUsers() {
    this.loadingUsers.set(true);
    try {
      this.users.set(await this.content.searchUsers(this.search()));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudieron cargar los usuarios.');
    } finally {
      this.loadingUsers.set(false);
    }
  }

  roleName(key: string): string {
    return this.roles().find((r) => r.key === key)?.name ?? key;
  }

  availableRoles(u: StaffUser): RoleInfo[] {
    return this.assignable().filter((r) => !u.roles.includes(r.key));
  }

  async addRole(u: StaffUser, role: string) {
    if (!role) return;
    await this.runUserAction(u, () => this.content.assignRole(u.id, role), (roles) => [...roles, role]);
  }

  async removeRole(u: StaffUser, role: string) {
    if (!confirm(`¿Quitar el rol ${this.roleName(role)} a ${u.displayName}?`)) return;
    await this.runUserAction(u, () => this.content.revokeRole(u.id, role), (roles) => roles.filter((r) => r !== role));
  }

  private async runUserAction(u: StaffUser, action: () => Promise<void>, update: (roles: string[]) => string[]) {
    this.busyUser.set(u.id);
    try {
      await action();
      this.users.update((list) => list.map((x) => (x.id === u.id ? { ...x, roles: update(x.roles) } : x)));
      if (u.id === this.myId()) void this.auth.refreshProfile();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo cambiar el rol.');
    } finally {
      this.busyUser.set(null);
    }
  }

  askEmail(u: StaffUser) {
    this.emailShown.set(null);
    this.emailReason.set('');
    this.emailReasonFor.set(this.emailReasonFor() === u.id ? null : u.id);
  }

  async revealEmail(u: StaffUser) {
    const reason = this.emailReason().trim();
    if (reason.length < 10) {
      alert('Escribe el motivo (mínimo 10 caracteres). Queda registrado.');
      return;
    }
    try {
      const email = await this.content.getUserEmail(u.id, reason);
      this.emailShown.set({ userId: u.id, email });
      this.emailReasonFor.set(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo consultar el correo.');
    }
  }
}
