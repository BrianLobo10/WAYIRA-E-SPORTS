import { Injectable, inject } from '@angular/core';
import { Timestamp } from '../utils/timestamp';
import { Observable, from } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type { News } from '../models';

/**
 * Noticias, buzón de contacto y gestión de roles sobre Supabase.
 * Los permisos los decide la base de datos: news.manage, contact.read, roles.assign.
 */

export interface ContactRow {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  contactType: string;
  read: boolean;
  createdAt: Date;
  senderId: string | null;
}

export interface RoleInfo {
  key: string;
  name: string;
  description: string;
  rank: number;
}

export interface StaffUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  roles: string[];
}

interface NewsRow {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  category: string;
  image_url: string | null;
  author_id: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
  author: { display_name: string } | null;
}

const ts = (iso: string) => Timestamp.fromDate(new Date(iso));

@Injectable({ providedIn: 'root' })
export class ContentService {
  private readonly sb = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  // ---------------------------------------------------------------------------
  // Noticias
  // ---------------------------------------------------------------------------

  async canManageNews(): Promise<boolean> {
    await this.auth.waitForInit();
    return this.auth.hasPermission('news.manage');
  }

  /** Noticias publicadas (cualquiera). Quien gestiona noticias ve también los borradores. */
  getNews(max = 50): Observable<News[]> {
    return from(
      this.sb
        .from('news')
        .select('id, title, content, excerpt, category, image_url, author_id, published, created_at, updated_at, author:profiles!news_author_id_fkey(display_name)')
        .order('created_at', { ascending: false })
        .limit(max)
        .then(({ data, error }) => {
          if (error) throw error;
          return ((data ?? []) as unknown as NewsRow[]).map((n) => ({
            id: n.id,
            title: n.title,
            content: n.content,
            excerpt: n.excerpt,
            category: n.category,
            imageUrl: n.image_url,
            authorId: n.author_id ?? '',
            authorName: n.author?.display_name ?? 'WAYIRA',
            published: n.published,
            createdAt: ts(n.created_at),
            updatedAt: ts(n.updated_at),
          }));
        }),
    );
  }

  async createNews(n: Pick<News, 'title' | 'content' | 'excerpt' | 'category' | 'imageUrl' | 'published'>): Promise<void> {
    const { error } = await this.sb.from('news').insert({
      ...this.newsRow(n),
      author_id: this.auth.user()?.id ?? null,
    });
    if (error) throw new Error(friendly(error));
  }

  async updateNews(id: string, n: Partial<News>): Promise<void> {
    const { error } = await this.sb.from('news').update(this.newsRow(n)).eq('id', id);
    if (error) throw new Error(friendly(error));
  }

  async deleteNews(id: string): Promise<void> {
    const { error } = await this.sb.from('news').delete().eq('id', id);
    if (error) throw new Error(friendly(error));
  }

  /** Sube la imagen de una noticia (bucket news-images, solo con permiso). Devuelve la URL pública. */
  async uploadNewsImage(file: File): Promise<string> {
    const blob = await recompress(file, 1600);
    const ext = blob.type === 'image/webp' ? 'webp' : (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
    const { error } = await this.sb.storage.from('news-images').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
    if (error) throw new Error(friendly(error));
    return this.sb.storage.from('news-images').getPublicUrl(path).data.publicUrl;
  }

  private newsRow(n: Partial<News>): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    if ('title' in n) row['title'] = n.title?.trim();
    if ('content' in n) row['content'] = n.content ?? '';
    if ('excerpt' in n) row['excerpt'] = (n.excerpt ?? '').slice(0, 400);
    if ('category' in n) row['category'] = n.category ?? 'General';
    if ('imageUrl' in n) row['image_url'] = n.imageUrl?.startsWith('https://') ? n.imageUrl : null;
    if ('published' in n) {
      row['published'] = !!n.published;
      if (n.published) row['published_at'] = new Date().toISOString();
    }
    return row;
  }

  // ---------------------------------------------------------------------------
  // Proyectos activos (site_config, clave 'projects')
  // ---------------------------------------------------------------------------

  async canEditSiteContent(): Promise<boolean> {
    await this.auth.waitForInit();
    return this.auth.hasPermission('site.content') || this.auth.hasPermission('site.manage');
  }

  async getProjects<T>(): Promise<T[]> {
    const { data } = await this.sb.from('site_config').select('value').eq('key', 'projects').maybeSingle();
    const items = (data as { value: { items?: T[] } } | null)?.value?.items;
    return Array.isArray(items) ? items : [];
  }

  async saveProjects<T>(items: T[]): Promise<void> {
    const value = { items };
    // Un editor solo puede actualizar; crear la clave la primera vez requiere administrador
    const { data, error } = await this.sb.from('site_config').update({ value }).eq('key', 'projects').select('key');
    if (error) throw new Error(friendly(error));
    if (!data?.length) {
      const { error: insertError } = await this.sb.from('site_config').insert({ key: 'projects', value });
      if (insertError) throw new Error(friendly(insertError));
    }
  }

  // ---------------------------------------------------------------------------
  // Contacto
  // ---------------------------------------------------------------------------

  /** Cualquiera puede escribir (con o sin cuenta). El servidor limita los envíos seguidos. */
  async sendContactMessage(m: { name: string; email: string; subject?: string; message: string; contactType: string }): Promise<void> {
    await this.auth.waitForInit();
    const { error } = await this.sb.from('contact_messages').insert({
      name: m.name.trim().slice(0, 120),
      email: m.email.trim().slice(0, 254),
      subject: m.subject?.trim().slice(0, 200) || null,
      message: m.message.trim().slice(0, 5000),
      contact_type: (m.contactType || 'general').slice(0, 40),
      sender_id: this.auth.user()?.id ?? null,
    });
    if (error) throw new Error(friendly(error));
  }

  async getContactMessages(): Promise<ContactRow[]> {
    const { data, error } = await this.sb
      .from('contact_messages')
      .select('id, name, email, subject, message, contact_type, read, created_at, sender_id')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(friendly(error));
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r['id'] as string,
      name: r['name'] as string,
      email: r['email'] as string,
      subject: (r['subject'] as string) ?? null,
      message: r['message'] as string,
      contactType: r['contact_type'] as string,
      read: r['read'] as boolean,
      createdAt: new Date(r['created_at'] as string),
      senderId: (r['sender_id'] as string) ?? null,
    }));
  }

  async setContactRead(id: string, read: boolean): Promise<void> {
    const { error } = await this.sb.from('contact_messages').update({ read }).eq('id', id);
    if (error) throw new Error(friendly(error));
  }

  async deleteContactMessage(id: string): Promise<void> {
    const { error } = await this.sb.from('contact_messages').delete().eq('id', id);
    if (error) throw new Error(friendly(error));
  }

  // ---------------------------------------------------------------------------
  // Roles (panel de staff)
  // ---------------------------------------------------------------------------

  async getRoles(): Promise<RoleInfo[]> {
    const { data, error } = await this.sb.from('roles').select('key, name, description, rank').order('rank', { ascending: false });
    if (error) throw new Error(friendly(error));
    return (data ?? []) as RoleInfo[];
  }

  /** Busca jugadores por nombre (o lista al staff actual si no hay búsqueda). */
  async searchUsers(term: string): Promise<StaffUser[]> {
    const q = term.trim();
    let ids: string[] | null = null;
    if (!q) {
      const { data } = await this.sb.from('user_roles').select('user_id');
      ids = [...new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id))];
      if (!ids.length) return [];
    }
    let query = this.sb.from('profiles').select('id, display_name, avatar_url, user_roles!user_roles_user_id_fkey(role_key)').order('display_name').limit(30);
    query = ids ? query.in('id', ids) : query.ilike('display_name', `%${q.replace(/[%_]/g, '')}%`);
    const { data, error } = await query;
    if (error) throw new Error(friendly(error));
    return ((data ?? []) as unknown as Array<{ id: string; display_name: string; avatar_url: string | null; user_roles: { role_key: string }[] }>).map((u) => ({
      id: u.id,
      displayName: u.display_name,
      avatarUrl: u.avatar_url,
      roles: (u.user_roles ?? []).map((r) => r.role_key),
    }));
  }

  /** La base devuelve null si se hizo, o el motivo del rechazo (que queda en la auditoría). */
  async assignRole(userId: string, role: string, reason?: string): Promise<void> {
    const { data, error } = await this.sb.rpc('assign_role', { target: userId, p_role: role, p_reason: reason ?? null });
    if (error) throw new Error(friendly(error));
    if (data) throw new Error(String(data));
  }

  async revokeRole(userId: string, role: string, reason?: string): Promise<void> {
    const { data, error } = await this.sb.rpc('revoke_role', { target: userId, p_role: role, p_reason: reason ?? null });
    if (error) throw new Error(friendly(error));
    if (data) throw new Error(String(data));
  }

  /** Solo superadmin. Queda registrado con el motivo; límite de 5 por hora y 20 por día. */
  async getUserEmail(userId: string, reason: string, contactMessageId?: string): Promise<string> {
    const { data, error } = await this.sb.rpc('get_user_email', {
      target: userId,
      reason,
      contact_message: contactMessageId ?? null,
    });
    if (error) throw new Error(friendly(error));
    return data as string;
  }
}

/** Mensajes de la base de datos en español; los técnicos se cambian por uno genérico. */
export function friendly(error: { message?: string; code?: string }): string {
  const msg = error.message ?? '';
  if (/^[A-ZÁÉÍÓÚÑ¿¡]/.test(msg) && !/violates|permission|syntax|column|relation|function|row-level/i.test(msg)) return msg;
  if (error.code === '42501' || /row-level|permission/i.test(msg)) return 'No tienes permiso para hacer esto.';
  if (error.code === '23514') return 'Revisa los datos: algún campo no tiene el formato correcto.';
  return 'No se pudo completar la acción. Intenta de nuevo.';
}

/** Reduce la imagen y la pasa a WebP (si no gana nada, sube la original). */
export async function recompress(file: File, maxSide: number): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
    return blob && blob.type === 'image/webp' && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
