import { Injectable, inject } from '@angular/core';
import { Timestamp } from '../utils/timestamp';
import { Observable, from } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type { UserProfile, Post, Comment, ReactionKind } from '../models';

/**
 * Perfiles, seguidores, publicaciones y comentarios sobre Supabase.
 * Devuelve los mismos modelos que usaba la versión de Firebase (UserProfile, Post, Comment)
 * para que las páginas existentes funcionen sin rehacer sus plantillas.
 * La seguridad la aplica la base de datos (RLS): aquí no se decide quién puede qué.
 */

type Reaction = { user_id: string; kind: ReactionKind };
type AuthorRow = { display_name: string; avatar_url: string | null } | null;

interface ProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  riot_game_name: string | null;
  riot_tag_line: string | null;
  riot_region: string | null;
  riot_puuid: string | null;
  riot_verified: boolean;
  created_at: string;
}

interface CommentRow {
  id: string;
  parent_id: string | null;
  reply_to_id: string | null;
  updated_at: string | null;
  author_id: string;
  content: string;
  created_at: string;
  author: AuthorRow;
  comment_reactions: Reaction[];
}

interface PostRow {
  id: string;
  author_id: string;
  content: string;
  image_urls: string[];
  video_url: string | null;
  created_at: string;
  updated_at: string;
  author: AuthorRow;
  post_reactions: Reaction[];
  comments: CommentRow[];
}

/** Comentario con su id real de base de datos (los índices de la plantilla se traducen a este id). */
type DbComment = Comment & { id: string; replies?: DbComment[] };

const PUBLIC_PROFILE_COLUMNS =
  'id, display_name, avatar_url, cover_url, bio, riot_game_name, riot_tag_line, riot_region, riot_verified, created_at';
/** Con sesión se lee también riot_puuid; los visitantes solo tienen permiso sobre las columnas públicas. */
const PROFILE_COLUMNS = PUBLIC_PROFILE_COLUMNS + ', riot_puuid';

const POST_COLUMNS = `id, author_id, content, image_urls, video_url, created_at, updated_at,
  author:profiles!posts_author_id_fkey(display_name, avatar_url),
  post_reactions(user_id, kind),
  comments!comments_post_id_fkey(id, parent_id, reply_to_id, author_id, content, created_at, updated_at,
    author:profiles!comments_author_id_fkey(display_name, avatar_url), comment_reactions(user_id, kind))`;

// Las relaciones llevan el nombre de la clave foránea: posts↔profiles también se une por post_reactions
// y PostgREST no sabría cuál usar.

/** Tamaño máximo (lado mayor) al que se recomprimen las imágenes antes de subirlas. */
const MAX_SIDE = { avatars: 512, covers: 1920, 'post-media': 2048, 'team-logos': 512 } as const;
type Bucket = keyof typeof MAX_SIDE;

const ts = (iso: string) => Timestamp.fromDate(new Date(iso));
const idsOf = (rows: Reaction[], kind: Reaction['kind']) => rows.filter((r) => r.kind === kind).map((r) => r.user_id);
const byUser = (rows: Reaction[]) => Object.fromEntries(rows.map((r) => [r.user_id, r.kind])) as Record<string, ReactionKind>;

/** Archivo de Storage a partir de su URL pública (para borrar las imágenes que ya no se usan) */
function storagePath(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length).split('?')[0]) : null;
}

@Injectable({ providedIn: 'root' })
export class CommunityService {
  private readonly sb = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  /** Última versión cargada de cada publicación, para traducir "comentario n.º X" a su id. */
  private readonly postCache = new Map<string, Post>();

  /** Usuario con sesión, con la forma que esperaban las páginas antiguas. */
  getCurrentUser(): { uid: string; displayName: string; photoURL: string | null } | null {
    const user = this.auth.user();
    if (!user) return null;
    const p = this.auth.profile();
    return { uid: user.id, displayName: p?.display_name ?? 'Jugador', photoURL: p?.avatar_url ?? null };
  }

  // ---------------------------------------------------------------------------
  // Perfiles y seguidores
  // ---------------------------------------------------------------------------

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    const [{ data, error }, followers, following] = await Promise.all([
      this.sb.from('profiles').select(this.auth.user() ? PROFILE_COLUMNS : PUBLIC_PROFILE_COLUMNS).eq('id', uid).maybeSingle(),
      this.sb.from('follows').select('follower_id').eq('following_id', uid),
      this.sb.from('follows').select('following_id').eq('follower_id', uid),
    ]);
    if (error) throw error;
    if (!data) return null;
    const row = data as unknown as ProfileRow;
    return {
      uid: row.id,
      email: '',
      displayName: row.display_name,
      photoURL: row.avatar_url ?? undefined,
      coverImageURL: row.cover_url ?? undefined,
      role: this.auth.user()?.id === row.id && this.auth.permissions().length ? 'admin' : 'user',
      gameName: row.riot_game_name ?? undefined,
      tagLine: row.riot_tag_line ?? undefined,
      region: row.riot_region ?? undefined,
      puuid: row.riot_puuid ?? undefined,
      riotVerified: row.riot_verified,
      followers: (followers.data ?? []).map((f: { follower_id: string }) => f.follower_id),
      following: (following.data ?? []).map((f: { following_id: string }) => f.following_id),
      createdAt: ts(row.created_at),
      bio: row.bio ?? undefined,
    };
  }

  /** Antes era en tiempo real; ahora es una lectura única (el perfil cambia poco). */
  getUserProfileRealtime(uid: string): Observable<UserProfile | null> {
    return from(this.getUserProfile(uid));
  }

  /** Guarda solo los campos que el usuario puede editar. Los demás se ignoran. */
  async updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
    const map: Record<string, string> = {
      displayName: 'display_name',
      bio: 'bio',
      photoURL: 'avatar_url',
      coverImageURL: 'cover_url',
      gameName: 'riot_game_name',
      tagLine: 'riot_tag_line',
      region: 'riot_region',
    };
    const patch: Record<string, string | null> = {};
    for (const [key, column] of Object.entries(map)) {
      if (!(key in data)) continue;
      const value = (data as Record<string, unknown>)[key];
      patch[column] = typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
    }
    if (patch['display_name'] === null) delete patch['display_name'];
    if (!Object.keys(patch).length) return;
    const { error } = await this.sb.from('profiles').update(patch).eq('id', uid);
    if (error) throw error;
    if (uid === this.auth.user()?.id) void this.auth.refreshProfile();
  }

  /** En Firebase actualizaba el nombre de Riot; aquí no hace falta (se consulta en vivo). */
  async checkAndUpdateUserSummonerName(_uid: string): Promise<boolean> {
    return false;
  }

  async followUser(currentUserId: string, targetUserId: string): Promise<void> {
    const { error } = await this.sb.from('follows').insert({ follower_id: currentUserId, following_id: targetUserId });
    if (error && error.code !== '23505') throw error; // 23505: ya lo seguía
  }

  async unfollowUser(currentUserId: string, targetUserId: string): Promise<void> {
    const { error } = await this.sb.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', targetUserId);
    if (error) throw error;
  }

  /** Jugadores a los que aún no sigues (los más recientes primero). */
  getSuggestedUsers(currentUserId: string, max = 6): Observable<UserProfile[]> {
    return from(
      (async () => {
        const { data: following } = await this.sb.from('follows').select('following_id').eq('follower_id', currentUserId);
        const exclude = [currentUserId, ...((following ?? []) as { following_id: string }[]).map((f) => f.following_id)];
        const { data, error } = await this.sb
          .from('profiles')
          .select('id, display_name, avatar_url, created_at')
          .not('id', 'in', `(${exclude.join(',')})`)
          .order('created_at', { ascending: false })
          .limit(max);
        if (error) throw error;
        return ((data ?? []) as Pick<ProfileRow, 'id' | 'display_name' | 'avatar_url' | 'created_at'>[]).map((row) => ({
          uid: row.id,
          email: '',
          displayName: row.display_name,
          photoURL: row.avatar_url ?? undefined,
          role: 'user' as const,
          followers: [],
          following: [],
          createdAt: ts(row.created_at),
        }));
      })(),
    );
  }

  /** Jugadores para descubrir (más recientes primero), con quién ya sigues marcado. */
  async getExploreUsers(page: number, pageSize = 30): Promise<{ users: UserProfile[]; hasMore: boolean }> {
    const me = this.auth.user()?.id;
    const from = page * pageSize;
    let query = this.sb
      .from('profiles')
      .select('id, display_name, avatar_url, bio, riot_game_name, riot_tag_line, created_at')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize);
    if (me) query = query.neq('id', me);
    const [{ data, error }, following] = await Promise.all([
      query,
      me ? this.sb.from('follows').select('following_id').eq('follower_id', me) : Promise.resolve({ data: [] }),
    ]);
    if (error) throw error;
    const followingIds = new Set(((following.data ?? []) as { following_id: string }[]).map((f) => f.following_id));
    const rows = (data ?? []) as Array<{ id: string; display_name: string; avatar_url: string | null; bio: string | null; riot_game_name: string | null; riot_tag_line: string | null; created_at: string }>;
    return {
      hasMore: rows.length > pageSize,
      users: rows.slice(0, pageSize).map((r) => ({
        uid: r.id,
        email: '',
        displayName: r.display_name,
        photoURL: r.avatar_url ?? undefined,
        bio: r.bio ?? undefined,
        gameName: r.riot_game_name ?? undefined,
        tagLine: r.riot_tag_line ?? undefined,
        role: 'user' as const,
        followers: me && followingIds.has(r.id) ? [me] : [],
        following: [],
        createdAt: ts(r.created_at),
      })),
    };
  }

  /**
   * Avisa cuando alguien publica, comenta o reacciona (Supabase Realtime).
   * Agrupa los avisos seguidos en uno solo. Devuelve la función para dejar de escuchar.
   */
  watchCommunity(onChange: () => void): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const notify = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(onChange, 600);
    };
    const channel = this.sb
      .channel(`comunidad-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, notify)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, notify)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_reactions' }, notify)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comment_reactions' }, notify)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void this.sb.removeChannel(channel);
    };
  }

  // ---------------------------------------------------------------------------
  // Publicaciones
  // ---------------------------------------------------------------------------

  getUserPosts(userId: string): Observable<Post[]> {
    return from(this.fetchPosts((q) => q.eq('author_id', userId)));
  }

  getPosts(limitCount = 20): Observable<Post[]> {
    return from(this.fetchPosts((q) => q.limit(limitCount)));
  }

  getPostById(postId: string): Observable<Post | null> {
    return from(this.fetchPosts((q) => q.eq('id', postId)).then((list) => list[0] ?? null));
  }

  async createPost(post: Partial<Post> & { authorId: string; content: string }): Promise<string> {
    const { data, error } = await this.sb
      .from('posts')
      .insert({
        author_id: post.authorId,
        content: post.content ?? '',
        image_urls: post.images ?? [],
        video_url: post.video ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  /** Borra la publicación y, si es tuya, sus imágenes y video de Storage */
  async deletePost(postId: string, media: string[] = []): Promise<void> {
    const { error } = await this.sb.from('posts').delete().eq('id', postId);
    if (error) throw error;
    await this.removeMedia(media);
  }

  /** Edita texto/imágenes/video (la base de datos solo deja cambiar esas columnas y solo al autor) */
  async updatePost(postId: string, changes: { content: string; images: string[]; video: string | null }, removedMedia: string[] = []): Promise<void> {
    const { data, error } = await this.sb
      .from('posts')
      .update({ content: changes.content, image_urls: changes.images, video_url: changes.video })
      .eq('id', postId)
      .select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No tienes permiso para editar esta publicación.');
    await this.removeMedia(removedMedia);
  }

  /** Quita de Storage archivos propios que ya no usa ninguna publicación (si falla, no bloquea) */
  private async removeMedia(urls: string[]) {
    const uid = this.auth.user()?.id;
    const paths = urls.map((u) => storagePath(u, 'post-media')).filter((p): p is string => !!p && !!uid && p.startsWith(uid + '/'));
    if (paths.length) await this.sb.storage.from('post-media').remove(paths).catch(() => undefined);
  }

  /**
   * Reacciona a una publicación o comentario. Pulsar la misma reacción la quita; otra la reemplaza.
   * Devuelve la reacción final del usuario (o null si la quitó).
   */
  async setReaction(target: 'post' | 'comment', id: string, kind: ReactionKind | null): Promise<void> {
    const uid = this.auth.user()?.id;
    if (!uid) throw new Error('Necesitas iniciar sesión para reaccionar.');
    const table = target === 'post' ? 'post_reactions' : 'comment_reactions';
    const key = target === 'post' ? 'post_id' : 'comment_id';
    const result = kind === null
      ? await this.sb.from(table).delete().eq(key, id).eq('user_id', uid)
      : await this.sb.from(table).upsert({ [key]: id, user_id: uid, kind }, { onConflict: `${key},user_id` });
    if (result.error) throw result.error;
  }

  // Guardados -----------------------------------------------------------------------
  async getSavedPostIds(): Promise<Set<string>> {
    if (!this.auth.user()) return new Set();
    const { data, error } = await this.sb.from('saved_posts').select('post_id');
    if (error) return new Set();
    return new Set((data ?? []).map((r: { post_id: string }) => r.post_id));
  }

  async setSaved(postId: string, saved: boolean): Promise<void> {
    const uid = this.auth.user()?.id;
    if (!uid) throw new Error('Necesitas iniciar sesión para guardar publicaciones.');
    const { error } = saved
      ? await this.sb.from('saved_posts').upsert({ user_id: uid, post_id: postId }, { onConflict: 'user_id,post_id', ignoreDuplicates: true })
      : await this.sb.from('saved_posts').delete().eq('post_id', postId).eq('user_id', uid);
    if (error) throw error;
  }

  getSavedPosts(): Observable<Post[]> {
    return from((async () => {
      const ids = [...(await this.getSavedPostIds())];
      if (!ids.length) return [];
      return this.fetchPosts((q) => q.in('id', ids));
    })());
  }

  // Reportes ------------------------------------------------------------------------
  async report(targetType: 'post' | 'comment' | 'user', targetId: string, reason: 'spam' | 'acoso' | 'ofensivo' | 'trampas' | 'otro', details = ''): Promise<'ok' | 'duplicado'> {
    const uid = this.auth.user()?.id;
    if (!uid) throw new Error('Necesitas iniciar sesión para reportar.');
    const { error } = await this.sb.from('reports').insert({
      reporter_id: uid, target_type: targetType, target_id: targetId, reason, details: details.slice(0, 500), status: 'open',
    });
    if (error?.code === '23505') return 'duplicado';
    if (error) throw error;
    return 'ok';
  }

  /** Me gusta / no me gusta: pulsar de nuevo la misma reacción la quita. */
  likePost(postId: string, userId: string) {
    return this.react('post_reactions', 'post_id', postId, userId, 'like');
  }

  dislikePost(postId: string, userId: string) {
    return this.react('post_reactions', 'post_id', postId, userId, 'dislike');
  }

  // ---------------------------------------------------------------------------
  // Comentarios
  // ---------------------------------------------------------------------------

  async addComment(
    postId: string,
    comment: { authorId: string; content: string; authorName?: string; authorPhoto?: string | null },
    parentCommentIndex?: number,
  ): Promise<void> {
    const content = comment.content.trim();
    if (!content) return;
    const parent = parentCommentIndex !== undefined ? this.commentAt(postId, parentCommentIndex) : null;
    const { error } = await this.sb.from('comments').insert({
      post_id: postId,
      author_id: comment.authorId,
      content,
      parent_id: parent?.id ?? null,
    });
    if (error) throw error;
  }

  /** Comenta o responde (por id). Si respondes a una respuesta, la base de datos la cuelga del comentario original. */
  async addCommentById(postId: string, content: string, parentId: string | null = null): Promise<void> {
    const uid = this.auth.user()?.id;
    const text = content.trim();
    if (!uid) throw new Error('Necesitas iniciar sesión para comentar.');
    if (!text) return;
    const { error } = await this.sb.from('comments').insert({ post_id: postId, author_id: uid, content: text, parent_id: parentId });
    if (error) throw error;
  }

  async updateComment(commentId: string, content: string): Promise<void> {
    const text = content.trim();
    if (!text) throw new Error('El comentario no puede quedar vacío.');
    const { data, error } = await this.sb.from('comments').update({ content: text }).eq('id', commentId).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No tienes permiso para editar este comentario.');
  }

  async deleteComment(commentId: string): Promise<void> {
    const { data, error } = await this.sb.from('comments').delete().eq('id', commentId).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No tienes permiso para eliminar este comentario.');
  }

  likeComment(postId: string, commentIndex: number, userId: string, replyIndex?: number) {
    const c = this.commentAt(postId, commentIndex, replyIndex);
    return c ? this.react('comment_reactions', 'comment_id', c.id, userId, 'like') : Promise.resolve();
  }

  dislikeComment(postId: string, commentIndex: number, userId: string, replyIndex?: number) {
    const c = this.commentAt(postId, commentIndex, replyIndex);
    return c ? this.react('comment_reactions', 'comment_id', c.id, userId, 'dislike') : Promise.resolve();
  }

  // ---------------------------------------------------------------------------
  // Archivos
  // ---------------------------------------------------------------------------

  /** Sube una imagen a la carpeta del usuario, recomprimida a WebP. Devuelve la URL pública. */
  async uploadImage(file: File, bucket: Bucket): Promise<string> {
    return this.upload(await this.recompress(file, MAX_SIDE[bucket]), bucket);
  }

  async uploadVideo(file: File): Promise<string> {
    return this.upload(file, 'post-media');
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  private async fetchPosts(filter: (q: any) => any): Promise<Post[]> {
    const query = filter(this.sb.from('posts').select(POST_COLUMNS).order('created_at', { ascending: false }));
    const { data, error } = await query;
    if (error) throw error;
    const posts = ((data ?? []) as PostRow[]).map((row) => this.toPost(row));
    posts.forEach((p) => this.postCache.set(p.id!, p));
    return posts;
  }

  private toPost(row: PostRow): Post {
    const toComment = (c: CommentRow): DbComment => ({
      id: c.id,
      authorId: c.author_id,
      authorName: c.author?.display_name ?? 'Jugador',
      authorPhoto: c.author?.avatar_url ?? null,
      content: c.content,
      likes: idsOf(c.comment_reactions ?? [], 'like'),
      dislikes: idsOf(c.comment_reactions ?? [], 'dislike'),
      reactions: byUser(c.comment_reactions ?? []),
      createdAt: ts(c.created_at),
      editedAt: c.updated_at ? ts(c.updated_at) : null,
      parentId: c.parent_id ?? undefined,
      replyToId: c.reply_to_id ?? null,
    });
    const all = [...(row.comments ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)).map(toComment);
    const names = new Map(all.map((c) => [c.id, c.authorName]));
    all.forEach((c) => { if (c.replyToId) c.replyToName = names.get(c.replyToId) ?? null; });
    const top = all.filter((c) => !c.parentId);
    for (const c of top) {
      const replies = all.filter((r) => r.parentId === c.id);
      if (replies.length) c.replies = replies;
    }
    return {
      id: row.id,
      authorId: row.author_id,
      authorName: row.author?.display_name ?? 'Jugador',
      authorPhoto: row.author?.avatar_url ?? null,
      content: row.content,
      images: row.image_urls?.length ? row.image_urls : undefined,
      video: row.video_url ?? undefined,
      likes: idsOf(row.post_reactions ?? [], 'like'),
      dislikes: idsOf(row.post_reactions ?? [], 'dislike'),
      reactions: byUser(row.post_reactions ?? []),
      comments: top,
      createdAt: ts(row.created_at),
      updatedAt: ts(row.updated_at),
    };
  }

  private commentAt(postId: string, index: number, replyIndex?: number): DbComment | null {
    const top = this.postCache.get(postId)?.comments?.[index] as DbComment | undefined;
    if (!top) return null;
    return replyIndex === undefined ? top : ((top.replies?.[replyIndex] as DbComment | undefined) ?? null);
  }

  private async react(
    table: 'post_reactions' | 'comment_reactions',
    key: 'post_id' | 'comment_id',
    id: string,
    userId: string,
    kind: Reaction['kind'],
  ): Promise<void> {
    const { data: existing, error } = await this.sb
      .from(table).select('kind').eq(key, id).eq('user_id', userId).maybeSingle();
    if (error) throw error;
    const current = (existing as { kind: Reaction['kind'] } | null)?.kind;
    const result =
      current === kind
        ? await this.sb.from(table).delete().eq(key, id).eq('user_id', userId)
        : current
          ? await this.sb.from(table).update({ kind }).eq(key, id).eq('user_id', userId)
          : await this.sb.from(table).insert({ [key]: id, user_id: userId, kind });
    if (result.error) throw result.error;
  }

  private async upload(file: Blob, bucket: Bucket): Promise<string> {
    const uid = this.auth.user()?.id;
    if (!uid) throw new Error('Necesitas iniciar sesión para subir archivos.');
    const ext = file.type === 'image/webp' ? 'webp' : (file.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
    const path = `${uid}/${crypto.randomUUID()}.${ext}`;
    const { error } = await this.sb.storage.from(bucket).upload(path, file, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    });
    if (error) throw error;
    return this.sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  /** Reduce y convierte a WebP. Los GIF se suben tal cual para no perder la animación. */
  private async recompress(file: File, maxSide: number): Promise<Blob> {
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
}
