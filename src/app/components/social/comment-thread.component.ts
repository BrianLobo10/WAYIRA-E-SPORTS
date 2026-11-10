import { Component, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Comment, Post, ReactionKind } from '../../models';
import { CommunityService } from '../../services/community.service';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';
import { ReactionBarComponent } from './reaction-bar.component';
import { MoreMenuComponent, MenuItem, ICONS } from './more-menu.component';
import { EmojiPickerComponent, insertAtCursor } from './emoji-picker.component';
import { ReportDialogComponent, ReportReason } from './report-dialog.component';
import { fullDate, initial, postUrl, timeAgo, wasEdited } from './social-utils';

type C = Comment & { id: string; pending?: boolean };

/**
 * Comentarios y respuestas de una publicación.
 * Respuestas a un solo nivel: responder a una respuesta queda bajo el mismo comentario con «@nombre».
 * Reacciones, edición y borrado se ven al instante y se revierten si Supabase lo rechaza.
 */
@Component({
  selector: 'app-comment-thread',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, ReactionBarComponent, MoreMenuComponent, EmojiPickerComponent, ReportDialogComponent],
  template: `
    <section class="thread" aria-label="Comentarios">
      <h3 class="title">Comentarios <span>{{ total() }}</span></h3>

      @for (c of comments(); track c.id) {
        <ng-container *ngTemplateOutlet="item; context: { $implicit: c, reply: false }"></ng-container>
        @if (c.replies?.length) {
          <div class="replies-wrap">
            <button type="button" class="toggle" (click)="toggleReplies(c.id)" [attr.aria-expanded]="isOpen(c.id)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="isOpen(c.id) ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'" /></svg>
              {{ isOpen(c.id) ? 'Ocultar' : 'Ver' }} {{ c.replies!.length }} {{ c.replies!.length === 1 ? 'respuesta' : 'respuestas' }}
            </button>
            @if (isOpen(c.id)) {
              <div class="replies">
                @for (r of c.replies!; track r.id) {
                  <ng-container *ngTemplateOutlet="item; context: { $implicit: r, reply: true, root: c }"></ng-container>
                }
              </div>
            }
          </div>
        }
        @if (replyTo()?.rootId === c.id) {
          <div class="composer composer--reply">
            <p class="replying">Respondiendo a <b>&#64;{{ replyTo()!.name }}</b> <button type="button" class="link" (click)="replyTo.set(null)">Cancelar</button></p>
            <ng-container *ngTemplateOutlet="composer; context: { reply: true }"></ng-container>
          </div>
        }
      } @empty {
        <p class="empty">Nadie ha opinado todavía. ¿Qué dices tú?</p>
      }

      @if (userId()) {
        @if (!replyTo()) {
          <div class="composer">
            <ng-container *ngTemplateOutlet="composer; context: { reply: false }"></ng-container>
          </div>
        }
      } @else {
        <p class="empty"><a routerLink="/login">Inicia sesión</a> para comentar.</p>
      }
    </section>

    <ng-template #item let-c let-reply="reply" let-root="root">
      <article class="c" [class.c--reply]="reply" [class.c--pending]="c.pending" [id]="'c-' + c.id">
        <a class="avatar" [routerLink]="['/profile', c.authorId]" [attr.aria-label]="'Perfil de ' + c.authorName">
          @if (c.authorPhoto) { <img [src]="c.authorPhoto" alt="" referrerpolicy="no-referrer" loading="lazy" /> } @else { <span>{{ initial(c.authorName) }}</span> }
        </a>
        <div class="body">
          <div class="bubble">
            <header class="meta">
              <a class="name" [routerLink]="['/profile', c.authorId]">{{ c.authorName }}</a>
              <time [attr.datetime]="iso(c.createdAt)" [title]="fullDate(c.createdAt)">{{ timeAgo(c.createdAt) }}</time>
              @if (edited(c)) { <span class="edited" [title]="'Editado: ' + fullDate(c.editedAt)">· editado</span> }
              @if (!c.pending) {
                <app-more-menu class="menu" [items]="menuFor(c)" label="Opciones del comentario" (select)="onMenu($event, c)" />
              }
            </header>
            @if (editingId() === c.id) {
              <textarea #editBox class="edit" rows="2" maxlength="2000" [value]="editText()" (input)="editText.set($any($event.target).value)"
                        (keydown.escape)="editingId.set(null)" (keydown.enter)="$any($event).ctrlKey && saveEdit(c)" aria-label="Editar comentario"></textarea>
              <div class="edit-actions">
                <button type="button" class="link" (click)="editingId.set(null)">Cancelar</button>
                <button type="button" class="pill" (click)="saveEdit(c)" [disabled]="!editText().trim() || busy()">Guardar</button>
              </div>
            } @else {
              <p class="text">@if (c.replyToName) { <span class="mention">&#64;{{ c.replyToName }}</span> }{{ c.content }}</p>
            }
          </div>
          @if (!c.pending) {
            <div class="actions">
              <app-reaction-bar [reactions]="c.reactions" [userId]="userId()" [compact]="true" [disabled]="!userId()" (react)="react(c, $event)" />
              @if (userId()) {
                <button type="button" class="link" (click)="startReply(c, root ?? c)">Responder</button>
              }
            </div>
          }
        </div>
      </article>
    </ng-template>

    <ng-template #composer let-reply="reply">
      <form class="compose" (submit)="$event.preventDefault(); send()">
        <textarea #input class="input" rows="1" maxlength="2000" [placeholder]="reply ? 'Escribe tu respuesta…' : 'Escribe un comentario…'"
                  [value]="draft()" (input)="draft.set($any($event.target).value); autoGrow($any($event.target))"
                  (keydown.enter)="onEnter($any($event))" aria-label="Escribe un comentario"></textarea>
        <div class="emoji-wrap">
          <button type="button" class="icon" aria-label="Emojis" [attr.aria-expanded]="showEmoji()" (click)="$event.stopPropagation(); showEmoji.set(!showEmoji())">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8.5 14a4 4 0 007 0M9 9.5v.5M15 9.5v.5" /></svg>
          </button>
          @if (showEmoji()) { <app-emoji-picker class="picker-pos" (picked)="addEmoji($event)" (close)="showEmoji.set(false)" /> }
        </div>
        <button type="submit" class="send" [disabled]="!draft().trim() || busy()" aria-label="Enviar">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-3-7-7-1z" /></svg>
        </button>
      </form>
    </ng-template>

    @if (reporting(); as r) {
      <app-report-dialog what="el comentario" [sending]="busy()" (submitReport)="sendReport(r, $event)" (cancel)="reporting.set(null)" />
    }
  `,
  styles: [`
    :host { display: block; }
    .title { margin: 0 0 12px; font-size: 14px; font-weight: 600; color: var(--white); }
    .title span { margin-left: 4px; color: var(--text-secondary); font-weight: 500; font-variant-numeric: tabular-nums; }
    .c { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 10px; padding: 6px 0; }
    .c--reply { grid-template-columns: 26px minmax(0, 1fr); }
    .c--pending { opacity: .6; }
    .avatar { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; overflow: hidden; background: var(--volt); color: var(--volt-ink); font-weight: 700; font-size: 13px; text-decoration: none; }
    .c--reply .avatar { width: 26px; height: 26px; font-size: 11px; }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .body { min-width: 0; }
    .bubble { padding: 8px 12px; background: var(--surface-2); border-radius: 12px; }
    .meta { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 12px; color: var(--text-secondary); }
    .name { font-size: 13px; font-weight: 600; color: var(--white); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .name:hover { text-decoration: underline; text-underline-offset: 3px; }
    .menu { margin-left: auto; margin-right: -8px; }
    .text { margin: 2px 0 0; font-size: 14px; line-height: 1.45; color: var(--white); white-space: pre-line; overflow-wrap: anywhere; }
    .mention { margin-right: 4px; color: var(--volt); font-weight: 600; }
    .actions { display: flex; align-items: center; gap: 4px; margin: 2px 0 0 4px; }
    .link { border: 0; background: none; padding: 4px 6px; color: var(--text-secondary); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .link:hover { color: var(--white); }
    .replies-wrap { margin-left: 42px; }
    .toggle { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; padding: 4px 0; color: var(--volt); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .toggle svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; }
    .replies { border-left: 2px solid var(--border); padding-left: 12px; }
    .edit { width: 100%; margin-top: 4px; padding: 8px; border: 1px solid var(--border-input, var(--border)); border-radius: 6px; background: var(--surface-1); color: var(--white); font: inherit; font-size: 14px; resize: vertical; }
    .edit:focus { outline: 2px solid var(--volt); border-color: transparent; }
    .edit-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px; }
    .pill { min-height: 32px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--volt); color: var(--volt-ink); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .pill:disabled { opacity: .5; }
    .empty { margin: 8px 0 12px; font-size: 14px; color: var(--text-secondary); }
    .empty a { color: var(--volt); }
    .composer { margin-top: 10px; }
    .composer:not(.composer--reply) { position: sticky; bottom: 0; z-index: 2; margin: 10px -16px -16px; padding: 10px 16px 16px; background: var(--surface-1); border-top: 1px solid var(--border); }
    .composer--reply { margin: 0 0 8px 42px; }
    .replying { margin: 0 0 6px; font-size: 12px; color: var(--text-secondary); }
    .replying b { color: var(--volt); }
    .compose { position: relative; display: flex; align-items: flex-end; gap: 4px; padding: 4px 4px 4px 14px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 20px; }
    .compose:focus-within { border-color: var(--volt); }
    .input { flex: 1; min-width: 0; min-height: 36px; max-height: 140px; padding: 8px 0; border: 0; background: none; color: var(--white); font: inherit; font-size: 14px; line-height: 1.4; resize: none; }
    .input:focus { outline: none; }
    .input::placeholder { color: var(--text-secondary); }
    .icon, .send { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 50%; background: none; color: var(--text-secondary); cursor: pointer; flex-shrink: 0; }
    .icon:hover { color: var(--white); background: var(--surface-3); }
    .send { background: var(--volt); color: var(--volt-ink); }
    .send:disabled { background: var(--surface-3); color: var(--text-secondary); cursor: not-allowed; }
    .icon svg, .send svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .emoji-wrap { position: relative; }
    .picker-pos { bottom: calc(100% + 8px); right: -40px; }
    .link:focus-visible, .toggle:focus-visible, .icon:focus-visible, .send:focus-visible, .pill:focus-visible, .name:focus-visible, .avatar:focus-visible { outline: 2px solid var(--volt); outline-offset: 2px; }
    @media (max-width: 560px) { .replies-wrap, .composer--reply { margin-left: 20px; } .picker-pos { right: -8px; } }
  `],
})
export class CommentThreadComponent {
  private community = inject(CommunityService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  post = input.required<Post>();
  userId = input<string | null>(null);
  /** Pide al padre recargar la publicación (para traer ids reales, contadores, etc.) */
  changed = output<void>();

  comments = signal<C[]>([]);
  open = signal<Set<string>>(new Set());
  draft = signal('');
  replyTo = signal<{ id: string; rootId: string; name: string } | null>(null);
  editingId = signal<string | null>(null);
  editText = signal('');
  reporting = signal<C | null>(null);
  showEmoji = signal(false);
  busy = signal(false);
  private inputEl = viewChild<ElementRef<HTMLTextAreaElement>>('input');

  readonly timeAgo = timeAgo;
  readonly fullDate = fullDate;
  readonly initial = initial;
  total = computed(() => this.comments().reduce((s, c) => s + 1 + (c.replies?.length ?? 0), 0));

  constructor() {
    effect(() => {
      const list = (this.post().comments ?? []) as C[];
      untracked(() => this.comments.set(list.map((c) => ({ ...c, replies: (c.replies ?? []).map((r) => ({ ...r })) })) as C[]));
    });
  }

  edited(c: C) { return !c.pending && wasEdited(c.createdAt, c.editedAt); }
  iso(ts: unknown) { const t = ts as { toDate?: () => Date }; return t?.toDate ? t.toDate().toISOString() : ''; }
  isOpen(id: string) { return this.open().has(id); }
  toggleReplies(id: string) { this.open.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  menuFor(c: C): MenuItem[] {
    const mine = c.authorId === this.userId();
    const items: MenuItem[] = [];
    if (mine) {
      items.push({ id: 'edit', label: 'Editar', icon: ICONS.edit }, { id: 'delete', label: 'Eliminar', icon: ICONS.trash, danger: true });
    }
    items.push({ id: 'link', label: 'Copiar enlace', icon: ICONS.link });
    if (!mine && this.userId()) items.push({ id: 'report', label: 'Reportar comentario', icon: ICONS.flag, danger: true });
    return items;
  }

  async onMenu(id: string, c: C) {
    if (id === 'edit') { this.editingId.set(c.id); this.editText.set(c.content); }
    if (id === 'delete') await this.remove(c);
    if (id === 'link') {
      try { await navigator.clipboard.writeText(`${postUrl(this.post())}#c-${c.id}`); this.toast.success('Enlace del comentario copiado'); }
      catch { this.toast.error('No se pudo copiar el enlace'); }
    }
    if (id === 'report') this.reporting.set(c);
  }

  startReply(target: C, root: C) {
    this.replyTo.set({ id: target.id, rootId: root.id, name: target.authorName });
    this.open.update((s) => new Set(s).add(root.id));
    queueMicrotask(() => this.inputEl()?.nativeElement.focus());
  }

  addEmoji(e: string) { this.draft.set(insertAtCursor(this.inputEl()?.nativeElement, this.draft(), e)); }

  autoGrow(el: HTMLTextAreaElement) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; }

  onEnter(ev: KeyboardEvent) {
    // Enter envía; Shift+Enter hace salto de línea
    if (!ev.shiftKey) { ev.preventDefault(); this.send(); }
  }

  async send() {
    const text = this.draft().trim();
    const uid = this.userId();
    if (!text || !uid || this.busy()) return;
    const me = this.community.getCurrentUser();
    const reply = this.replyTo();
    const temp: C = {
      id: 'tmp-' + Date.now(), authorId: uid, authorName: me?.displayName || 'Tú', authorPhoto: me?.photoURL ?? null,
      content: text, likes: [], dislikes: [], reactions: {}, createdAt: { toDate: () => new Date() } as never, pending: true,
      replyToName: reply && reply.id !== reply.rootId ? reply.name : null,
    };
    // Se muestra al instante
    if (reply) this.comments.update((l) => l.map((c) => (c.id === reply.rootId ? { ...c, replies: [...(c.replies ?? []), temp] } : c)));
    else this.comments.update((l) => [...l, temp]);
    this.draft.set('');
    this.replyTo.set(null);
    const el = this.inputEl()?.nativeElement; if (el) el.style.height = '';
    this.busy.set(true);
    try {
      await this.community.addCommentById(this.post().id!, text, reply?.id ?? null);
      this.changed.emit();
    } catch (e) {
      this.removeLocal(temp.id);
      this.draft.set(text);
      this.toast.error('No se pudo comentar', (e as Error)?.message);
    } finally {
      this.busy.set(false);
    }
  }

  async saveEdit(c: C) {
    const text = this.editText().trim();
    if (!text || text === c.content) { this.editingId.set(null); return; }
    const before = c.content;
    this.patchLocal(c.id, { content: text, editedAt: { toDate: () => new Date() } as never });
    this.editingId.set(null);
    try { await this.community.updateComment(c.id, text); this.changed.emit(); }
    catch (e) { this.patchLocal(c.id, { content: before }); this.toast.error('No se pudo editar', (e as Error)?.message); }
  }

  async remove(c: C) {
    const ok = await this.dialog.confirm({
      title: '¿Eliminar este comentario?',
      message: c.replies?.length ? `También se borrarán sus ${c.replies.length} respuestas.` : 'No se puede deshacer.',
      confirmLabel: 'Eliminar', danger: true,
    });
    if (!ok) return;
    const snapshot = this.comments();
    this.removeLocal(c.id);
    try { await this.community.deleteComment(c.id); this.changed.emit(); this.toast.success('Comentario eliminado'); }
    catch (e) { this.comments.set(snapshot); this.toast.error('No se pudo eliminar', (e as Error)?.message); }
  }

  async react(c: C, kind: ReactionKind | null) {
    const uid = this.userId();
    if (!uid) return;
    const before = { ...(c.reactions ?? {}) };
    const next = { ...before };
    if (kind) next[uid] = kind; else delete next[uid];
    this.patchLocal(c.id, { reactions: next });
    try { await this.community.setReaction('comment', c.id, kind); }
    catch (e) { this.patchLocal(c.id, { reactions: before }); this.toast.error('No se guardó tu reacción', (e as Error)?.message); }
  }

  async sendReport(c: C, r: { reason: ReportReason; details: string }) {
    this.busy.set(true);
    try {
      const res = await this.community.report('comment', c.id, r.reason, r.details);
      this.toast.success(res === 'duplicado' ? 'Ya habías reportado este comentario' : 'Reporte enviado', 'Gracias, el equipo lo revisará.');
      this.reporting.set(null);
    } catch (e) { this.toast.error('No se pudo enviar el reporte', (e as Error)?.message); }
    finally { this.busy.set(false); }
  }

  private patchLocal(id: string, change: Partial<C>) {
    this.comments.update((l) => l.map((c) => c.id === id ? { ...c, ...change } : { ...c, replies: c.replies?.map((r) => (r.id === id ? { ...r, ...change } : r)) }) as C[]);
  }

  private removeLocal(id: string) {
    this.comments.update((l) => l.filter((c) => c.id !== id).map((c) => ({ ...c, replies: c.replies?.filter((r) => r.id !== id) })) as C[]);
  }
}
