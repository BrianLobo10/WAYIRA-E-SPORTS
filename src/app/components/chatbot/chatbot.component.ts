import {
  Component,
  signal,
  inject,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  OnInit,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { User } from '@angular/fire/auth';
import { environment } from '../../../environments/environment';
import { FirebaseService } from '../../services/firebase.service';
import { PotatoChatService, PotatoChatMessage } from '../../services/potato-chat.service';

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css']
})
export class ChatbotComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('chatMessages') chatMessages!: ElementRef<HTMLDivElement>;

  private http = inject(HttpClient);
  private firebase = inject(FirebaseService);
  private potatoChat = inject(PotatoChatService);
  private subs = new Subscription();
  private scrollPending = false;
  private uid: string | null = null;

  isOpen = signal(false);
  menuOpen = signal(false);
  messages = signal<PotatoChatMessage[]>([]);
  userInput = signal('');
  isTyping = signal(false);
  isAuthenticated = signal(false);
  loadingHistory = signal(false);
  confirmClear = signal(false);

  ngOnInit() {
    this.subs.add(
      this.firebase.currentUser.subscribe((user: User | null) => {
        const prev = this.uid;
        this.uid = user?.uid ?? null;
        this.isAuthenticated.set(!!user);
        if (user && user.uid !== prev) {
          void this.loadUserHistory(user.uid);
        } else if (!user) {
          this.messages.set(this.potatoChat.welcome(true));
        }
      })
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  ngAfterViewChecked() {
    if (this.scrollPending && this.chatMessages) {
      const el = this.chatMessages.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.scrollPending = false;
    }
  }

  async loadUserHistory(uid: string) {
    this.loadingHistory.set(true);
    try {
      const history = await this.potatoChat.load(uid);
      this.messages.set(history);
    } finally {
      this.loadingHistory.set(false);
      this.scrollPending = true;
    }
  }

  toggleChat() {
    this.isOpen.update((v) => !v);
    this.menuOpen.set(false);
    this.confirmClear.set(false);
    if (this.isOpen() && this.messages().length === 0) {
      this.messages.set(this.potatoChat.welcome(!this.isAuthenticated()));
    }
    if (this.isOpen()) this.scrollPending = true;
  }

  toggleMenu() {
    this.menuOpen.update((v) => !v);
    this.confirmClear.set(false);
  }

  askClear() {
    this.confirmClear.set(true);
    this.menuOpen.set(false);
  }

  cancelClear() {
    this.confirmClear.set(false);
  }

  async clearChat() {
    this.confirmClear.set(false);
    const welcome = this.potatoChat.welcome(!this.isAuthenticated());
    this.messages.set(welcome);
    if (this.uid) {
      try {
        await this.potatoChat.clear(this.uid);
        await this.potatoChat.save(this.uid, welcome);
      } catch {
        /* ignore */
      }
    }
    this.scrollPending = true;
  }

  sendMessage() {
    const text = this.userInput().trim();
    if (!text || this.isTyping()) return;

    const userMsg: PotatoChatMessage = { sender: 'user', text, at: Date.now() };
    this.messages.update((m) => [...m, userMsg]);
    this.userInput.set('');
    this.isTyping.set(true);
    this.scrollPending = true;

    const history = this.messages().slice(-12).map((m) => ({ sender: m.sender, text: m.text }));

    this.http
      .post<{ response: string }>(`${environment.apiUrl}/chatbot`, {
        message: text,
        conversationHistory: history
      })
      .subscribe({
        next: (res) => void this.reply(res.response || 'Ups, no pude responder eso. ¿Intentas otra pregunta? 😊'),
        error: () =>
          void this.reply(
            '¡Perdón! Tuve un problemita técnico 🥲 Prueba de nuevo en un momento o pregúntame sobre torneos, buscar jugador o LoL.'
          )
      });
  }

  private async reply(text: string) {
    const botMsg: PotatoChatMessage = { sender: 'bot', text, at: Date.now() };
    this.messages.update((m) => [...m, botMsg]);
    this.isTyping.set(false);
    this.scrollPending = true;
    if (this.uid) {
      try {
        await this.potatoChat.save(this.uid, this.messages());
      } catch {
        /* ignore */
      }
    }
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }
}
