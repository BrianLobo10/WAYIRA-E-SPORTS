import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { friendly, recompress } from './content.service';

/**
 * Datos del panel de staff (/staff) y del centro de control (/control).
 * La web solo pide; la base de datos decide con RLS y funciones que revisan permiso y rango.
 */

export interface ProjectRow {
  id: string;
  title: string;
  description: string;
  icon: string;
  statusLabel: string;
  period: string | null;
  imageUrls: string[];
  linkUrl: string | null;
  active: boolean;
  sortOrder: number;
  updatedAt: Date;
}

export type ProjectDraft = Omit<ProjectRow, 'id' | 'updatedAt'>;

export interface NewsAdminRow {
  id: string;
  title: string;
  category: string;
  published: boolean;
  createdAt: Date;
  authorName: string;
}

export interface TournamentAdminRow {
  id: string;
  name: string;
  status: string;
  startDate: Date | null;
  maxTeams: number | null;
  teams: number;
}

export interface GiveawayAdminRow {
  id: string;
  title: string;
  status: string;
  entryMode: string;
  winnersCount: number;
  closesAt: Date | null;
  entries: number;
}

export interface PlatformStats {
  users_total: number;
  users_new_7d: number;
  users_new_30d: number;
  users_active_30d: number;
  posts_total: number;
  news_published: number;
  projects_active: number;
  tournaments_active: number;
  tournaments_done: number;
  reports_open: number;
  suspended_now: number;
  signups_weekly: { week: string; count: number }[];
}

export interface AdminUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  roles: string[];
  provider: string | null;
  createdAt: Date;
  lastSignInAt: Date | null;
  suspendedUntil: Date | null;
  suspended: boolean;
  maxRank: number;
}

export interface AuditEntry {
  id: number;
  at: Date;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string | null;
  details: Record<string, unknown>;
  result: 'ok' | 'denied';
}

export interface Suspension {
  id: string;
  until: Date | null;
  reason: string;
  createdAt: Date;
  liftedAt: Date | null;
}

const date = (v: unknown): Date | null => (v ? new Date(v as string) : null);

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly sb = inject(SupabaseService).client;

  // ---------------------------------------------------------------------------
  // Proyectos (público ve los activos; con site.content se ven y gestionan todos)
  // ---------------------------------------------------------------------------

  async listProjects(): Promise<ProjectRow[]> {
    const { data, error } = await this.sb
      .from('projects')
      .select('id, title, description, icon, status_label, period, image_urls, link_url, active, sort_order, updated_at')
      .order('sort_order')
      .order('created_at');
    if (error) throw new Error(friendly(error));
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r['id'] as string,
      title: r['title'] as string,
      description: (r['description'] as string) ?? '',
      icon: (r['icon'] as string) ?? 'trophy',
      statusLabel: (r['status_label'] as string) ?? '',
      period: (r['period'] as string) ?? null,
      imageUrls: (r['image_urls'] as string[]) ?? [],
      linkUrl: (r['link_url'] as string) ?? null,
      active: !!r['active'],
      sortOrder: (r['sort_order'] as number) ?? 0,
      updatedAt: new Date(r['updated_at'] as string),
    }));
  }

  async saveProject(id: string | null, p: ProjectDraft): Promise<void> {
    const row = {
      title: p.title.trim(),
      description: p.description.trim(),
      icon: p.icon,
      status_label: p.statusLabel.trim() || 'Activo',
      period: p.period?.trim() || null,
      image_urls: p.imageUrls.filter((u) => u.startsWith('https://')).slice(0, 6),
      link_url: p.linkUrl?.trim().startsWith('https://') ? p.linkUrl.trim() : null,
      active: p.active,
      sort_order: p.sortOrder,
    };
    const { error } = id ? await this.sb.from('projects').update(row).eq('id', id) : await this.sb.from('projects').insert(row);
    if (error) throw new Error(friendly(error));
  }

  async setProjectActive(id: string, active: boolean): Promise<void> {
    const { error } = await this.sb.from('projects').update({ active }).eq('id', id);
    if (error) throw new Error(friendly(error));
  }

  async setProjectOrder(items: { id: string; sortOrder: number }[]): Promise<void> {
    for (const it of items) {
      const { error } = await this.sb.from('projects').update({ sort_order: it.sortOrder }).eq('id', it.id);
      if (error) throw new Error(friendly(error));
    }
  }

  async deleteProject(id: string): Promise<void> {
    const { error } = await this.sb.from('projects').delete().eq('id', id);
    if (error) throw new Error(friendly(error));
  }

  async uploadProjectImage(file: File): Promise<string> {
    if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new Error('Usa una imagen JPG, PNG, WebP o AVIF.');
    if (file.size > 15 * 1024 * 1024) throw new Error('La imagen pesa demasiado (máximo 15 MB antes de comprimir).');
    const blob = await recompress(file, 1600);
    if (blob.size > 5 * 1024 * 1024) throw new Error('La imagen sigue pesando más de 5 MB. Prueba con una más pequeña.');
    const ext = blob.type === 'image/webp' ? 'webp' : (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
    const { error } = await this.sb.storage.from('project-images').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
    if (error) throw new Error(friendly(error));
    return this.sb.storage.from('project-images').getPublicUrl(path).data.publicUrl;
  }

  // ---------------------------------------------------------------------------
  // Noticias, torneos y sorteos (resúmenes para el panel; la edición completa vive en cada página)
  // ---------------------------------------------------------------------------

  async listNews(): Promise<NewsAdminRow[]> {
    const { data, error } = await this.sb
      .from('news')
      .select('id, title, category, published, created_at, author:profiles!news_author_id_fkey(display_name)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(friendly(error));
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: r['id'] as string,
      title: r['title'] as string,
      category: (r['category'] as string) ?? 'General',
      published: !!r['published'],
      createdAt: new Date(r['created_at'] as string),
      authorName: (r['author'] as { display_name?: string } | null)?.display_name ?? 'WAYIRA',
    }));
  }

  async setNewsPublished(id: string, published: boolean): Promise<void> {
    const patch: Record<string, unknown> = { published };
    if (published) patch['published_at'] = new Date().toISOString();
    const { error } = await this.sb.from('news').update(patch).eq('id', id);
    if (error) throw new Error(friendly(error));
  }

  async deleteNews(id: string): Promise<void> {
    const { error } = await this.sb.from('news').delete().eq('id', id);
    if (error) throw new Error(friendly(error));
  }

  async listTournaments(): Promise<TournamentAdminRow[]> {
    const { data, error } = await this.sb
      .from('tournaments')
      .select('id, name, status, start_date, max_teams, tournament_teams(count)')
      .order('start_date', { ascending: false, nullsFirst: true })
      .limit(200);
    if (error) throw new Error(friendly(error));
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: r['id'] as string,
      name: r['name'] as string,
      status: r['status'] as string,
      startDate: date(r['start_date']),
      maxTeams: (r['max_teams'] as number) ?? null,
      teams: ((r['tournament_teams'] as { count: number }[] | null)?.[0]?.count) ?? 0,
    }));
  }

  async listGiveaways(): Promise<GiveawayAdminRow[]> {
    const { data, error } = await this.sb
      .from('giveaways')
      .select('id, title, status, entry_mode, winners_count, closes_at, giveaway_entries(count)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(friendly(error));
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: r['id'] as string,
      title: r['title'] as string,
      status: r['status'] as string,
      entryMode: r['entry_mode'] as string,
      winnersCount: r['winners_count'] as number,
      closesAt: date(r['closes_at']),
      entries: ((r['giveaway_entries'] as { count: number }[] | null)?.[0]?.count) ?? 0,
    }));
  }

  // ---------------------------------------------------------------------------
  // Centro de control (Superadmin) y usuarios (Admin y Superadmin)
  // ---------------------------------------------------------------------------

  async stats(): Promise<PlatformStats> {
    const { data, error } = await this.sb.rpc('platform_stats');
    if (error) throw new Error(friendly(error));
    return data as PlatformStats;
  }

  async myRank(): Promise<number> {
    const { data, error } = await this.sb.rpc('my_rank');
    if (error) throw new Error(friendly(error));
    return (data as number) ?? 10;
  }

  async listUsers(search: string, role: string): Promise<AdminUser[]> {
    const { data, error } = await this.sb.rpc('admin_list_users', { p_search: search.trim() || null, p_role: role || null, p_limit: 200 });
    if (error) throw new Error(friendly(error));
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r['id'] as string,
      displayName: (r['display_name'] as string) ?? 'Jugador',
      avatarUrl: (r['avatar_url'] as string) ?? null,
      roles: (r['roles'] as string[]) ?? [],
      provider: (r['provider'] as string) ?? null,
      createdAt: new Date(r['created_at'] as string),
      lastSignInAt: date(r['last_sign_in_at']),
      suspendedUntil: date(r['suspended_until']),
      suspended: !!r['suspended'],
      maxRank: (r['max_rank'] as number) ?? 10,
    }));
  }

  /** Permisos de cada rol (para mostrar qué gana o pierde alguien al cambiar de rol). */
  async rolePermissions(): Promise<Record<string, string[]>> {
    const { data, error } = await this.sb.from('role_permissions').select('role_key, permission');
    if (error) throw new Error(friendly(error));
    const out: Record<string, string[]> = {};
    for (const r of (data ?? []) as { role_key: string; permission: string }[]) (out[r.role_key] ??= []).push(r.permission);
    return out;
  }

  async suspend(userId: string, hours: number | null, reason: string): Promise<void> {
    const { data, error } = await this.sb.rpc('suspend_user', { target: userId, p_hours: hours ?? 0, p_reason: reason });
    if (error) throw new Error(friendly(error));
    if (data) throw new Error(String(data));
  }

  async liftSuspension(userId: string, reason?: string): Promise<void> {
    const { data, error } = await this.sb.rpc('lift_suspension', { target: userId, p_reason: reason ?? null });
    if (error) throw new Error(friendly(error));
    if (data) throw new Error(String(data));
  }

  async suspensions(userId: string): Promise<Suspension[]> {
    const { data, error } = await this.sb
      .from('user_suspensions')
      .select('id, until, reason, created_at, lifted_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(friendly(error));
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r['id'] as string,
      until: date(r['until']),
      reason: r['reason'] as string,
      createdAt: new Date(r['created_at'] as string),
      liftedAt: date(r['lifted_at']),
    }));
  }

  async audit(opts: { entity?: string; onlyDenied?: boolean; before?: Date; limit?: number } = {}): Promise<AuditEntry[]> {
    let q = this.sb
      .from('audit_log')
      .select('id, at, actor_id, actor_name, action, entity, entity_id, summary, details, result')
      .order('at', { ascending: false })
      .limit(opts.limit ?? 100);
    if (opts.entity) q = q.eq('entity', opts.entity);
    if (opts.onlyDenied) q = q.eq('result', 'denied');
    if (opts.before) q = q.lt('at', opts.before.toISOString());
    const { data, error } = await q;
    if (error) throw new Error(friendly(error));
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r['id'] as number,
      at: new Date(r['at'] as string),
      actorId: (r['actor_id'] as string) ?? null,
      actorName: (r['actor_name'] as string) ?? null,
      action: r['action'] as string,
      entity: r['entity'] as string,
      entityId: (r['entity_id'] as string) ?? null,
      summary: (r['summary'] as string) ?? null,
      details: (r['details'] as Record<string, unknown>) ?? {},
      result: r['result'] as 'ok' | 'denied',
    }));
  }
}

/** Textos legibles para la auditoría y los estados. */
export const ACTION_LABELS: Record<string, string> = {
  created: 'Creó',
  edited: 'Editó',
  deleted: 'Eliminó',
  published: 'Publicó',
  unpublished: 'Despublicó',
  activated: 'Activó',
  deactivated: 'Desactivó',
  role_grant: 'Rol asignado',
  role_revoke: 'Rol retirado',
  suspend: 'Suspensión',
  unsuspend: 'Reactivación',
  theme_saved: 'Cambió los colores',
  theme_reset: 'Restauró los colores',
};

export const ENTITY_LABELS: Record<string, string> = {
  tournaments: 'Torneo',
  news: 'Noticia',
  projects: 'Proyecto',
  giveaways: 'Sorteo',
  posts: 'Publicación',
  comments: 'Comentario',
  user: 'Usuario',
  site: 'Apariencia',
};

export const STATUS_LABELS: Record<string, string> = {
  upcoming: 'Próximo',
  ongoing: 'En curso',
  finished: 'Finalizado',
  confirmed: 'Confirmado',
  draft: 'Borrador',
  open: 'Abierto',
  closed: 'Cerrado',
  drawn: 'Sorteado',
  cancelled: 'Cancelado',
};

export function actionLabel(action: string): string {
  if (action.startsWith('status:')) return 'Estado → ' + (STATUS_LABELS[action.slice(7)] ?? action.slice(7));
  return ACTION_LABELS[action] ?? action;
}
