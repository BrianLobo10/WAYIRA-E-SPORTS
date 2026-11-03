import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface PotatoChatMessage {
  text: string;
  sender: 'user' | 'bot';
  at?: number;
}

const WELCOME: PotatoChatMessage = {
  sender: 'bot',
  text: '¡Hola! Soy POTATO 🥔 Me alegra ayudarte con WAYIRA E-SPORTS y League of Legends. ¿Qué te gustaría saber?'
};

const GUEST_WELCOME: PotatoChatMessage = {
  sender: 'bot',
  text: '¡Hola! Soy POTATO 🥔 Inicia sesión para que recuerde nuestra conversación. Mientras tanto, pregúntame sobre torneos, LoL o la web.'
};

/** Historial de POTATO por usuario (tabla potato_chat_sessions; solo el dueño lo ve). */
@Injectable({ providedIn: 'root' })
export class PotatoChatService {
  private readonly sb = inject(SupabaseService).client;

  welcome(forGuest = false): PotatoChatMessage[] {
    return [forGuest ? { ...GUEST_WELCOME } : { ...WELCOME }];
  }

  async load(uid: string): Promise<PotatoChatMessage[]> {
    try {
      const { data } = await this.sb.from('potato_chat_sessions').select('messages').eq('user_id', uid).maybeSingle();
      const list = ((data as { messages: PotatoChatMessage[] } | null)?.messages ?? []).filter(
        (m) => m && typeof m.text === 'string' && (m.sender === 'user' || m.sender === 'bot')
      );
      return list.length > 0 ? list : this.welcome();
    } catch {
      return this.welcome();
    }
  }

  async save(uid: string, messages: PotatoChatMessage[]): Promise<void> {
    const trimmed = messages.slice(-40).map((m) => ({
      text: m.text.slice(0, 2000),
      sender: m.sender,
      at: m.at ?? Date.now()
    }));
    // Actualiza si ya existe; si no, crea la fila
    const { data, error } = await this.sb
      .from('potato_chat_sessions')
      .update({ messages: trimmed })
      .eq('user_id', uid)
      .select('user_id');
    if (error) throw error;
    if (!data?.length) {
      const { error: insertError } = await this.sb.from('potato_chat_sessions').insert({ user_id: uid, messages: trimmed });
      if (insertError) throw insertError;
    }
  }

  async clear(uid: string): Promise<void> {
    await this.sb.from('potato_chat_sessions').delete().eq('user_id', uid);
  }
}
