import { Injectable, inject, signal } from '@angular/core';
import { Timestamp } from '../utils/timestamp';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type { Message, Notification, UserProfile } from '../models';

/**
 * Mensajes privados y notificaciones sobre Supabase.
 * - Solo los dos participantes ven una conversación (RLS); se abren con la función start_conversation.
 * - Las notificaciones las crea la base de datos (al recibir un like, comentario, seguidor o mensaje).
 * - Realtime avisa al instante de mensajes y notificaciones nuevas.
 */

export interface ConversationSummary {
  id: string;
  userId: string; // la otra persona
  profile: UserProfile | null;
  lastMessage: Message | null;
  unread: number;
}

type MiniProfile = { id: string; display_name: string; avatar_url: string | null } | null;

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
}

interface ConversationRow {
  id: string;
  user1_id: string;
  user2_id: string;
  last_message_at: string | null;
  user1: MiniProfile;
  user2: MiniProfile;
  messages: MessageRow[];
}

const ts = (iso: string) => Timestamp.fromDate(new Date(iso));

const toProfile = (p: MiniProfile): UserProfile | null =>
  p
    ? {
        uid: p.id,
        email: '',
        displayName: p.display_name,
        photoURL: p.avatar_url ?? undefined,
        role: 'user',
        followers: [],
        following: [],
        createdAt: Timestamp.now(),
      }
    : null;

@Injectable({ providedIn: 'root' })
export class MessagingService {
  private readonly sb = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  /** Mensajes sin leer (para la cabecera). */
  readonly unreadMessages = signal(0);
  /** Notificaciones sin leer (para la campana). */
  readonly unreadNotifications = signal(0);

  private me(): string | null {
    return this.auth.user()?.id ?? null;
  }

  // ---------------------------------------------------------------------------
  // Conversaciones
  // ---------------------------------------------------------------------------

  async getConversations(): Promise<ConversationSummary[]> {
    const me = this.me();
    if (!me) return [];
    const [{ data, error }, unread] = await Promise.all([
      this.sb
        .from('conversations')
        .select(`id, user1_id, user2_id, last_message_at,
          user1:profiles!conversations_user1_id_fkey(id, display_name, avatar_url),
          user2:profiles!conversations_user2_id_fkey(id, display_name, avatar_url),
          messages(id, conversation_id, sender_id, content, read_at, created_at)`)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { referencedTable: 'messages', ascending: false })
        .limit(1, { referencedTable: 'messages' }),
      this.unreadByConversation(),
    ]);
    if (error) throw error;
    const list = ((data ?? []) as unknown as ConversationRow[]).map((c) => {
      const otherIsUser1 = c.user2_id === me;
      const last = c.messages?.[0];
      return {
        id: c.id,
        userId: otherIsUser1 ? c.user1_id : c.user2_id,
        profile: toProfile(otherIsUser1 ? c.user1 : c.user2),
        lastMessage: last ? this.toMessage(last, c) : null,
        unread: unread.get(c.id) ?? 0,
      };
    });
    this.unreadMessages.set([...unread.values()].reduce((a, b) => a + b, 0));
    return list;
  }

  /** Abre (o reutiliza) la conversación con otra persona. Devuelve su id. */
  async openConversation(otherUserId: string): Promise<string> {
    const { data, error } = await this.sb.rpc('start_conversation', { other: otherUserId });
    if (error) throw new Error(friendly(error));
    return data as string;
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    const { data: conv } = await this.sb.from('conversations').select('id, user1_id, user2_id').eq('id', conversationId).maybeSingle();
    const { data, error } = await this.sb
      .from('messages')
      .select('id, conversation_id, sender_id, content, read_at, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw error;
    return ((data ?? []) as MessageRow[]).map((m) => this.toMessage(m, conv as Pick<ConversationRow, 'user1_id' | 'user2_id'> | null));
  }

  async sendMessage(conversationId: string, content: string): Promise<void> {
    const me = this.me();
    const text = content.trim();
    if (!me || !text) return;
    const { error } = await this.sb.from('messages').insert({ conversation_id: conversationId, sender_id: me, content: text.slice(0, 4000) });
    if (error) throw new Error(friendly(error));
  }

  async markConversationRead(conversationId: string): Promise<void> {
    await this.sb.rpc('mark_conversation_read', { conv: conversationId });
    void this.refreshUnreadMessages();
  }

  /** Borra la conversación completa (para los dos participantes). */
  async deleteConversation(conversationId: string): Promise<void> {
    const { error } = await this.sb.from('conversations').delete().eq('id', conversationId);
    if (error) throw new Error(friendly(error));
  }

  async refreshUnreadMessages(): Promise<number> {
    const unread = await this.unreadByConversation();
    const total = [...unread.values()].reduce((a, b) => a + b, 0);
    this.unreadMessages.set(total);
    return total;
  }

  // ---------------------------------------------------------------------------
  // Notificaciones
  // ---------------------------------------------------------------------------

  async getNotifications(limit = 30): Promise<Notification[]> {
    const me = this.me();
    if (!me) return [];
    const { data, error } = await this.sb
      .from('notifications')
      .select('id, user_id, type, post_id, comment_id, read, created_at, actor:profiles!notifications_actor_id_fkey(id, display_name, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as unknown as Array<{
      id: string; user_id: string; type: Notification['type']; post_id: string | null; comment_id: string | null;
      read: boolean; created_at: string; actor: MiniProfile;
    }>).map((n) => ({
      id: n.id,
      userId: n.user_id,
      type: n.type,
      fromUserId: n.actor?.id ?? '',
      fromUserName: n.actor?.display_name ?? 'Alguien',
      fromUserPhoto: n.actor?.avatar_url ?? null,
      postId: n.post_id ?? undefined,
      commentId: n.comment_id ?? undefined,
      read: n.read,
      createdAt: ts(n.created_at),
    }));
  }

  async refreshUnreadNotifications(): Promise<number> {
    if (!this.me()) return 0;
    const { count } = await this.sb.from('notifications').select('id', { count: 'exact', head: true }).eq('read', false);
    this.unreadNotifications.set(count ?? 0);
    return count ?? 0;
  }

  async markNotificationRead(id: string): Promise<void> {
    await this.sb.from('notifications').update({ read: true }).eq('id', id);
    void this.refreshUnreadNotifications();
  }

  async markAllNotificationsRead(): Promise<void> {
    await this.sb.from('notifications').update({ read: true }).eq('read', false);
    this.unreadNotifications.set(0);
  }

  // ---------------------------------------------------------------------------
  // Tiempo real
  // ---------------------------------------------------------------------------

  /**
   * Escucha mensajes y notificaciones nuevas del usuario. Devuelve la función para dejar de escuchar.
   * RLS hace que solo lleguen los eventos que el usuario puede ver.
   */
  watch(handlers: { onMessage?: (conversationId: string) => void; onNotification?: () => void }): () => void {
    const me = this.me();
    if (!me) return () => undefined;
    const channel = this.sb
      .channel(`bandeja-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload.new as MessageRow;
        if (row.sender_id !== me) void this.refreshUnreadMessages();
        handlers.onMessage?.(row.conversation_id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${me}` }, () => {
        void this.refreshUnreadNotifications();
        handlers.onNotification?.();
      })
      .subscribe();
    return () => void this.sb.removeChannel(channel);
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  private async unreadByConversation(): Promise<Map<string, number>> {
    const me = this.me();
    const map = new Map<string, number>();
    if (!me) return map;
    const { data } = await this.sb.from('messages').select('conversation_id').is('read_at', null).neq('sender_id', me).limit(1000);
    for (const row of (data ?? []) as { conversation_id: string }[]) {
      map.set(row.conversation_id, (map.get(row.conversation_id) ?? 0) + 1);
    }
    return map;
  }

  private toMessage(m: MessageRow, conv: Pick<ConversationRow, 'user1_id' | 'user2_id'> | null): Message {
    const to = conv ? (conv.user1_id === m.sender_id ? conv.user2_id : conv.user1_id) : '';
    return {
      id: m.id,
      fromId: m.sender_id,
      fromName: '',
      toId: to,
      content: m.content,
      timestamp: ts(m.created_at),
      read: !!m.read_at,
    };
  }
}

function friendly(error: { message?: string; code?: string }): string {
  const msg = error.message ?? '';
  if (/^[A-ZÁÉÍÓÚÑ¿¡]/.test(msg) && !/violates|permission|syntax|column|relation|function/i.test(msg)) return msg;
  if (error.code === '42501') return 'No tienes permiso para hacer esto.';
  return 'No se pudo completar la acción. Intenta de nuevo.';
}
