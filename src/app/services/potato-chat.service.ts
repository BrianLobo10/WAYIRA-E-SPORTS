import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from '@angular/fire/firestore';

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

@Injectable({ providedIn: 'root' })
export class PotatoChatService {
  private firestore = inject(Firestore);

  private docRef(uid: string) {
    return doc(this.firestore, 'users', uid, 'potatoChat', 'session');
  }

  welcome(forGuest = false): PotatoChatMessage[] {
    return [forGuest ? { ...GUEST_WELCOME } : { ...WELCOME }];
  }

  async load(uid: string): Promise<PotatoChatMessage[]> {
    try {
      const snap = await getDoc(this.docRef(uid));
      if (!snap.exists()) return this.welcome();
      const data = snap.data();
      const list = (data['messages'] as PotatoChatMessage[]) || [];
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
    await setDoc(this.docRef(uid), {
      messages: trimmed,
      updatedAt: serverTimestamp()
    });
  }

  async clear(uid: string): Promise<void> {
    await deleteDoc(this.docRef(uid));
  }
}
