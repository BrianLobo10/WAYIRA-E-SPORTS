import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Post, ReactionKind } from '../../models';
import { CommunityService } from '../../services/community.service';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';
import { ReactionBarComponent } from './reaction-bar.component';
import { MoreMenuComponent, MenuItem, ICONS } from './more-menu.component';
import { ReportDialogComponent, ReportReason } from './report-dialog.component';
import { PostEditorComponent } from './post-editor.component';
import { fullDate, initial, postUrl, timeAgo, wasEdited } from './social-utils';

/**
 * Una publicación: autor, texto, imágenes/video, reacciones y menú ⋯.
 * El menú hace todo aquí mismo (editar, eliminar, guardar, copiar, compartir, reportar)
 * y avisa al padre con `changed` / `deleted` para que actualice su lista.
 */
@Component({
  selector: 'app-post-card',
  standalone: true,
  imports: [RouterLink, ReactionBarComponent, MoreMenuComponent, ReportDialogComponent, PostEditorComponent],
  template: `
    <article class="card" [class.card--detail]="detail()" [attr.aria-label]="'Publicación de ' + p().authorName">
      <header class="head">
        <a class="avatar" [routerLink]="['/profile', p().authorId]" (click)="$event.stopPropagation()" [attr.aria-label]="'Perfil de ' + p().authorName">
          @if (p().authorPhoto) { <img [src]="p().authorPhoto" alt="" referrerpolicy="no-referrer" loading="lazy" decoding="async" /> } @else { <span>{{ initial(p().authorName) }}</span> }
        </a>
        <div class="who">
          <a class="name" [routerLink]="['/profile', p().authorId]" (click)="$event.stopPropagation()">{{ p().authorName }}</a>
          <span class="when">
            <time [attr.datetime]="iso()" [title]="fullDate(p().createdAt)">{{ timeAgo(p().createdAt) }}</time>
            @if (edited()) { <span [title]="'Editado: ' + fullDate(p().updatedAt)"> · editado</span> }
            @if (saved()) { <span class="saved-tag"> · guardado</span> }
          </span>
        </div>
        <app-more-menu [items]="menu()" label="Opciones de la publicación" (select)="onMenu($event)" (click)="$event.stopPropagation()" />
      </header>

      @if (p().content) {
        <p class="text" [class.text--clamp]="!detail() && !expanded() && long()">{{ p().content }}</p>
        @if (!detail() && long() && !expanded()) {
          <button type="button" class="more" (click)="$event.stopPropagation(); expanded.set(true)">Ver más</button>
        }
      }

      @if (images().length) {
        <div class="media" (click)="!detail() && open.emit()">
          <img [src]="images()[idx()]" [alt]="'Imagen ' + (idx() + 1) + ' de ' + images().length" referrerpolicy="no-referrer" loading="lazy" decoding="async" />
          @if (images().length > 1) {
            <button type="button" class="nav nav--prev" aria-label="Imagen anterior" (click)="step(-1, $event)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg></button>
            <button type="button" class="nav nav--next" aria-label="Imagen siguiente" (click)="step(1, $event)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
            <span class="dots" aria-hidden="true">@for (i of images(); track $index) { <i [class.on]="$index === idx()"></i> }</span>
            <span class="badge">{{ idx() + 1 }}/{{ images().length }}</span>
          }
        </div>
      } @else if (p().video) {
        <div class="media media--video"><video [src]="p().video" controls preload="metadata"></video></div>
      }

      <footer class="foot">
        <app-reaction-bar [reactions]="p().reactions" [userId]="userId()" [disabled]="!userId()" (react)="react($event)" />
        <button type="button" class="act" (click)="open.emit()" [attr.aria-label]="commentCount() + ' comentarios. Abrir publicación'">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.4A8 8 0 1121 12z" /></svg>
          <span>{{ commentCount() }}</span>
        </button>
        <button type="button" class="act act--end" (click)="share()" aria-label="Compartir">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.share" /></svg>
        </button>
      </footer>
    </article>

    @if (editing()) {
      <app-post-editor [post]="p()" [authorName]="p().authorName" [authorPhoto]="p().authorPhoto ?? null" (saved)="editing.set(false); changed.emit()" (closed)="editing.set(false)" />
    }
    @if (reporting()) {
      <app-report-dialog what="la publicación" [sending]="busy()" (submitReport)="sendReport($event)" (cancel)="reporting.set(false)" />
    }
  `,
  styles: [`
    :host { display: block; }
    .card { background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius-sm, 2px); box-shadow: var(--shadow-1, none); transition: border-color var(--duration-micro, .15s) ease; }
    .card:hover { border-color: var(--border-strong, var(--border)); }
    .card--detail { border: 0; box-shadow: none; background: transparent; }
    .card--detail:hover { border: 0; }
    .head { display: flex; align-items: center; gap: 12px; padding: 14px 8px 10px 16px; }
    .avatar { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: var(--volt); color: var(--volt-ink); font-weight: 700; text-decoration: none; }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .who { flex: 1; min-width: 0; display: grid; }
    .name { font-size: 15px; font-weight: 600; color: var(--white); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .name:hover { text-decoration: underline; text-underline-offset: 3px; }
    .when { font-size: 13px; color: var(--text-secondary); }
    .saved-tag { color: var(--volt); }
    .text { margin: 0 16px 12px; font-size: 15px; line-height: 1.55; color: var(--white); white-space: pre-line; overflow-wrap: anywhere; }
    .text--clamp { display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 4px; }
    .more { margin: 0 16px 12px; padding: 0; border: 0; background: none; color: var(--text-secondary); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
    .more:hover { color: var(--white); }
    .media { position: relative; display: flex; align-items: center; justify-content: center; min-height: 180px; max-height: 560px; overflow: hidden; background: var(--surface-2); cursor: pointer; }
    .card--detail .media { cursor: default; max-height: none; }
    .media img, .media video { display: block; width: 100%; max-height: 560px; object-fit: contain; }
    .card--detail .media img { max-height: 70vh; }
    .media--video { background: var(--bg); cursor: default; }
    .nav { position: absolute; top: 50%; translate: 0 -50%; display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 50%;
      background: color-mix(in srgb, var(--bg) 70%, transparent); color: var(--white); cursor: pointer; opacity: .85; transition: opacity var(--duration-micro, .15s) ease; }
    .nav:hover { opacity: 1; }
    .nav svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .nav--prev { left: 8px; } .nav--next { right: 8px; }
    .dots { position: absolute; bottom: 10px; left: 50%; translate: -50% 0; display: flex; gap: 4px; }
    .dots i { width: 6px; height: 6px; border-radius: 50%; background: color-mix(in srgb, var(--white) 45%, transparent); }
    .dots i.on { background: var(--white); }
    .badge { position: absolute; top: 10px; right: 10px; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--bg) 70%, transparent); color: var(--white); font-size: 12px; font-variant-numeric: tabular-nums; }
    .foot { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; margin-top: 4px; padding: 4px 8px; border-top: 1px solid var(--border); }
    .act { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 10px; border: 0; border-radius: var(--radius-sm, 2px); background: none; color: var(--text-secondary); font: inherit; font-size: 13px; font-variant-numeric: tabular-nums; cursor: pointer; transition: var(--t-ui); }
    .act:hover { background: var(--surface-2); color: var(--white); }
    .act--end { margin-left: auto; }
    .act svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    .avatar:focus-visible, .name:focus-visible, .more:focus-visible, .nav:focus-visible, .act:focus-visible { outline: 2px solid var(--volt); outline-offset: 2px; }
  `],
})
export class PostCardComponent {
  private community = inject(CommunityService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);
  private router = inject(Router);

  post = input.required<Post>();
  userId = input<string | null>(null);
  saved = input(false);
  /** true dentro del visor: sin marco, imagen más grande, texto completo */
  detail = input(false);

  open = output<void>();
  changed = output<void>();
  deleted = output<string>();
  savedChange = output<boolean>();

  /** Copia local para mostrar reacciones al instante */
  private override = signal<Partial<Post> | null>(null);
  p = computed<Post>(() => { const o = this.override(); return o ? { ...this.post(), ...o } : this.post(); });
  idx = signal(0);
  expanded = signal(false);
  editing = signal(false);
  reporting = signal(false);
  busy = signal(false);

  constructor() {
    // Cuando llega la versión del servidor, deja de usar la copia local
    effect(() => { this.post(); untracked(() => { this.override.set(null); if (this.idx() >= this.images().length) this.idx.set(0); }); });
  }

  readonly icons = ICONS;
  readonly timeAgo = timeAgo;
  readonly fullDate = fullDate;
  readonly initial = initial;

  images = computed(() => this.p().images ?? []);
  long = computed(() => (this.p().content?.length ?? 0) > 420 || (this.p().content?.split('\n').length ?? 0) > 6);
  edited = computed(() => wasEdited(this.p().createdAt, this.p().updatedAt));
  commentCount = computed(() => (this.p().comments ?? []).reduce((s, c) => s + 1 + (c.replies?.length ?? 0), 0));
  isMine = computed(() => !!this.userId() && this.p().authorId === this.userId());

  menu = computed<MenuItem[]>(() => {
    const items: MenuItem[] = [];
    if (this.isMine()) items.push({ id: 'edit', label: 'Editar publicación', icon: ICONS.edit });
    if (this.userId()) items.push(this.saved() ? { id: 'unsave', label: 'Quitar de guardados', icon: ICONS.unsave } : { id: 'save', label: 'Guardar publicación', icon: ICONS.save });
    items.push({ id: 'link', label: 'Copiar enlace', icon: ICONS.link }, { id: 'share', label: 'Compartir', icon: ICONS.share });
    if (!this.isMine()) items.push({ id: 'profile', label: 'Ver perfil de ' + this.p().authorName, icon: ICONS.profile });
    if (this.isMine()) items.push({ id: 'delete', label: 'Eliminar publicación', icon: ICONS.trash, danger: true });
    else if (this.userId()) items.push({ id: 'report', label: 'Reportar publicación', icon: ICONS.flag, danger: true });
    return items;
  });

  iso() { const t = this.p().createdAt as { toDate?: () => Date }; return t?.toDate ? t.toDate().toISOString() : ''; }

  step(d: number, ev: Event) {
    ev.stopPropagation();
    const n = this.images().length;
    this.idx.update((i) => (i + d + n) % n);
  }

  async onMenu(id: string) {
    switch (id) {
      case 'edit': this.editing.set(true); break;
      case 'delete': await this.remove(); break;
      case 'save': case 'unsave': await this.toggleSave(id === 'save'); break;
      case 'link': await this.copy(postUrl(this.p()), 'Enlace copiado'); break;
      case 'share': await this.share(); break;
      case 'report': this.reporting.set(true); break;
      case 'profile': void this.router.navigate(['/profile', this.p().authorId]); break;
    }
  }

  async react(kind: ReactionKind | null) {
    const uid = this.userId();
    const id = this.p().id;
    if (!uid || !id) return;
    const before = { ...(this.p().reactions ?? {}) };
    const next = { ...before };
    if (kind) next[uid] = kind; else delete next[uid];
    this.override.set({ reactions: next, ...this.legacyLists(next) });
    try { await this.community.setReaction('post', id, kind); }
    catch (e) {
      this.override.set({ reactions: before, ...this.legacyLists(before) });
      this.toast.error('No se guardó tu reacción', (e as Error)?.message);
    }
  }

  /** Mantiene likes/dislikes en sintonía para las vistas que aún los usan (perfil) */
  private legacyLists(map: Record<string, ReactionKind>) {
    const e = Object.entries(map);
    return { likes: e.filter(([, k]) => k !== 'dislike').map(([u]) => u), dislikes: e.filter(([, k]) => k === 'dislike').map(([u]) => u) };
  }

  private async remove() {
    const ok = await this.dialog.confirm({
      title: '¿Eliminar esta publicación?',
      message: 'Se borrarán también sus comentarios, reacciones e imágenes. No se puede deshacer.',
      confirmLabel: 'Eliminar', danger: true,
    });
    if (!ok) return;
    const p = this.p();
    try {
      await this.community.deletePost(p.id!, [...(p.images ?? []), ...(p.video ? [p.video] : [])]);
      this.deleted.emit(p.id!);
      this.toast.success('Publicación eliminada');
    } catch (e) { this.toast.error('No se pudo eliminar', (e as Error)?.message); }
  }

  private async toggleSave(save: boolean) {
    this.savedChange.emit(save);
    try {
      await this.community.setSaved(this.p().id!, save);
      this.toast.success(save ? 'Guardada' : 'Quitada de guardados', save ? 'La encuentras en tu perfil, pestaña Guardados.' : undefined);
    } catch (e) {
      this.savedChange.emit(!save);
      this.toast.error('No se pudo guardar', (e as Error)?.message);
    }
  }

  async share() {
    const url = postUrl(this.p());
    const text = (this.p().content || '').slice(0, 120);
    if (navigator.share) {
      try { await navigator.share({ title: 'Publicación de ' + this.p().authorName + ' en WAYIRA', text, url }); return; }
      catch (e) { if ((e as DOMException)?.name === 'AbortError') return; }
    }
    await this.copy(url, 'Enlace copiado', 'Pégalo donde quieras compartirlo.');
  }

  private async copy(text: string, ok: string, detail?: string) {
    try { await navigator.clipboard.writeText(text); this.toast.success(ok, detail); }
    catch { this.toast.error('No se pudo copiar el enlace'); }
  }

  async sendReport(r: { reason: ReportReason; details: string }) {
    this.busy.set(true);
    try {
      const res = await this.community.report('post', this.p().id!, r.reason, r.details);
      this.toast.success(res === 'duplicado' ? 'Ya habías reportado esta publicación' : 'Reporte enviado', 'Gracias, el equipo lo revisará.');
      this.reporting.set(false);
    } catch (e) { this.toast.error('No se pudo enviar el reporte', (e as Error)?.message); }
    finally { this.busy.set(false); }
  }
}
