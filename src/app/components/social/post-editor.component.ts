import { Component, ElementRef, OnDestroy, AfterViewInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { gsap } from 'gsap';
import { Post } from '../../models';
import { CommunityService } from '../../services/community.service';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';
import { EmojiPickerComponent, frequentEmojis, insertAtCursor } from './emoji-picker.component';
import { initial } from './social-utils';

const MAX_CHARS = 5000;
const MAX_IMAGES = 10;
const MAX_VIDEO_MB = 50;

/**
 * Crear o editar una publicación. Al editar conserva lo que no cambies (texto, imágenes, video);
 * las imágenes quitadas se borran de Storage al guardar.
 */
@Component({
  selector: 'app-post-editor',
  standalone: true,
  imports: [EmojiPickerComponent],
  template: `
    <div class="overlay" (click)="tryClose()">
      <div #box class="dialog" role="dialog" aria-modal="true" aria-labelledby="pe-title" (click)="$event.stopPropagation()" (keydown.escape)="tryClose()">
        <header class="head">
          <h2 id="pe-title">{{ post() ? 'Editar publicación' : 'Nueva publicación' }}</h2>
          <button type="button" class="x" aria-label="Cerrar" (click)="tryClose()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div class="author">
          @if (authorPhoto()) { <img [src]="authorPhoto()" alt="" referrerpolicy="no-referrer" /> } @else { <span class="ph">{{ initial(authorName()) }}</span> }
          <b>{{ authorName() }}</b>
        </div>
        <textarea #ta class="text" rows="5" [maxLength]="maxChars" placeholder="¿Qué jugada quieres contar?" [value]="text()"
                  (input)="text.set($any($event.target).value)" [disabled]="saving()" aria-label="Texto de la publicación"></textarea>
        <div class="quick">
          @for (e of frequent; track e) { <button type="button" class="q" (click)="addEmoji(e)" [attr.aria-label]="'Insertar ' + e">{{ e }}</button> }
          <span class="count" [class.is-warn]="text().length > maxChars - 200">{{ text().length }}/{{ maxChars }}</span>
        </div>

        @if (images().length || newImages().length || video() || newVideo()) {
          <div class="media">
            @for (url of images(); track url) {
              <figure class="thumb"><img [src]="url" alt="" /><button type="button" class="rm" (click)="removeImage(url)" aria-label="Quitar imagen">×</button></figure>
            }
            @for (f of newImages(); track $index) {
              <figure class="thumb"><img [src]="preview(f)" alt="" /><span class="new">Nueva</span><button type="button" class="rm" (click)="removeNewImage($index)" aria-label="Quitar imagen">×</button></figure>
            }
            @if (video() || newVideo()) {
              <figure class="thumb thumb--video"><video [src]="newVideo() ? preview(newVideo()!) : video()!" muted></video><button type="button" class="rm" (click)="removeVideo()" aria-label="Quitar video">×</button></figure>
            }
          </div>
        }

        <footer class="foot">
          <div class="tools">
            <label class="tool" [class.is-off]="saving() || totalImages() >= maxImages" title="Añadir imágenes">
              <input type="file" accept="image/*" multiple (change)="onImages($event)" [disabled]="saving() || totalImages() >= maxImages" />
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5" /><circle cx="9" cy="9" r="1.5" /></svg>
              <span class="sr-only">Añadir imágenes</span>
            </label>
            <label class="tool" [class.is-off]="saving()" title="Añadir video">
              <input type="file" accept="video/*" (change)="onVideo($event)" [disabled]="saving()" />
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h11v12H4zM15 10l5-3v10l-5-3" /></svg>
              <span class="sr-only">Añadir video</span>
            </label>
            <div class="emoji-wrap">
              <button type="button" class="tool" title="Emojis" aria-label="Emojis" [attr.aria-expanded]="showEmoji()" (click)="$event.stopPropagation(); showEmoji.set(!showEmoji())">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8.5 14a4 4 0 007 0M9 9.5v.5M15 9.5v.5" /></svg>
              </button>
              @if (showEmoji()) { <app-emoji-picker class="picker-pos" (picked)="addEmoji($event)" (close)="showEmoji.set(false)" /> }
            </div>
          </div>
          <div class="btns">
            <button type="button" class="btn btn--quiet" (click)="tryClose()" [disabled]="saving()">Cancelar</button>
            <button type="button" class="btn btn--primary" (click)="save()" [disabled]="!canSave()">
              {{ saving() ? (post() ? 'Guardando…' : 'Publicando…') : (post() ? 'Guardar cambios' : 'Publicar') }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .overlay { position: fixed; inset: 0; z-index: 1100; display: grid; place-items: center; padding: 16px; background: color-mix(in srgb, var(--bg) 75%, transparent); }
    .dialog { width: 100%; max-width: 560px; max-height: calc(100dvh - 32px); display: flex; flex-direction: column; overflow: visible; background: var(--surface-1); border-radius: 6px; box-shadow: var(--shadow-pop); }
    .head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 10px; border-bottom: 1px solid var(--border); }
    h2 { margin: 0; font-family: var(--font-display); font-weight: 500; font-size: 1.25rem; color: var(--white); }
    .x { display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 50%; background: none; color: var(--text-secondary); cursor: pointer; }
    .x:hover { background: var(--surface-2); color: var(--white); }
    .x svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
    .author { display: flex; align-items: center; gap: 10px; padding: 14px 16px 0; color: var(--white); font-size: 14px; }
    .author img, .ph { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
    .ph { display: grid; place-items: center; background: var(--volt); color: var(--volt-ink); font-weight: 700; }
    .text { margin: 10px 16px 0; min-height: 120px; max-height: 40vh; padding: 0; border: 0; background: none; color: var(--white); font: inherit; font-size: 17px; line-height: 1.5; resize: none; overflow-y: auto; }
    .text:focus { outline: none; }
    .text::placeholder { color: var(--text-secondary); }
    .quick { display: flex; align-items: center; gap: 2px; padding: 6px 12px; flex-wrap: wrap; }
    .q { width: 32px; height: 32px; border: 0; border-radius: 4px; background: none; font-size: 18px; cursor: pointer; }
    .q:hover { background: var(--surface-2); }
    .count { margin-left: auto; font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
    .count.is-warn { color: var(--ember-text, var(--ember)); }
    .media { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; padding: 4px 16px 10px; overflow-y: auto; max-height: 30vh; }
    .thumb { position: relative; margin: 0; aspect-ratio: 1; border-radius: 4px; overflow: hidden; background: var(--surface-2); }
    .thumb img, .thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .rm { position: absolute; top: 4px; right: 4px; width: 26px; height: 26px; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--bg) 80%, transparent); color: var(--white); font-size: 16px; line-height: 1; cursor: pointer; }
    .new { position: absolute; left: 4px; bottom: 4px; padding: 2px 6px; border-radius: 2px; background: var(--volt); color: var(--volt-ink); font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 10px 16px 14px; border-top: 1px solid var(--border); }
    .tools { display: flex; gap: 4px; }
    .tool { position: relative; display: grid; place-items: center; width: 38px; height: 38px; border: 0; border-radius: 50%; background: none; color: var(--volt); cursor: pointer; }
    .tool:hover { background: var(--surface-2); }
    .tool.is-off { opacity: .4; cursor: not-allowed; }
    .tool input { position: absolute; inset: 0; opacity: 0; cursor: inherit; }
    .tool svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    .emoji-wrap { position: relative; }
    .picker-pos { bottom: calc(100% + 6px); left: 0; }
    .btns { display: flex; gap: 8px; margin-left: auto; }
    .btn { min-height: 40px; padding: 0 18px; border-radius: 999px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
    .btn--quiet { border: 1px solid var(--border-strong); background: none; color: var(--white); }
    .btn--primary { border: 0; background: var(--volt); color: var(--volt-ink); }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
    .btn:focus-visible, .tool:focus-within, .x:focus-visible, .q:focus-visible { outline: 2px solid var(--volt); outline-offset: 2px; }
    @media (max-width: 560px) {
      .overlay { padding: 0; place-items: end stretch; }
      .dialog { max-width: none; max-height: 92dvh; border-radius: 12px 12px 0 0; }
    }
  `],
})
export class PostEditorComponent implements AfterViewInit, OnDestroy {
  private community = inject(CommunityService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  /** null = crear; con publicación = editar */
  post = input<Post | null>(null);
  authorName = input('Tú');
  authorPhoto = input<string | null>(null);
  saved = output<void>();
  closed = output<void>();

  readonly maxChars = MAX_CHARS;
  readonly maxImages = MAX_IMAGES;
  readonly frequent = frequentEmojis();
  readonly initial = initial;
  text = signal('');
  images = signal<string[]>([]);
  video = signal<string | null>(null);
  newImages = signal<File[]>([]);
  newVideo = signal<File | null>(null);
  showEmoji = signal(false);
  saving = signal(false);
  private removed: string[] = [];
  private previews = new Map<File, string>();
  private box = viewChild<ElementRef<HTMLElement>>('box');
  private ta = viewChild<ElementRef<HTMLTextAreaElement>>('ta');

  totalImages = computed(() => this.images().length + this.newImages().length);
  hasMedia = computed(() => this.totalImages() > 0 || !!this.video() || !!this.newVideo());
  dirty = computed(() => {
    const p = this.post();
    if (!p) return !!this.text().trim() || this.hasMedia();
    return this.text() !== (p.content ?? '') || this.newImages().length > 0 || !!this.newVideo() || this.removed.length > 0
      || this.images().length !== (p.images?.length ?? 0) || this.video() !== (p.video ?? null);
  });
  canSave = computed(() => !this.saving() && (!!this.text().trim() || this.hasMedia()) && this.dirty() && this.text().length <= MAX_CHARS);

  ngAfterViewInit() {
    const p = this.post();
    if (p) { this.text.set(p.content ?? ''); this.images.set([...(p.images ?? [])]); this.video.set(p.video ?? null); }
    const el = this.box()?.nativeElement;
    if (el && !matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.from(el, { autoAlpha: 0, y: 16, duration: 0.22, ease: 'power2.out' });
    queueMicrotask(() => { const t = this.ta()?.nativeElement; if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } });
  }

  ngOnDestroy() { this.previews.forEach((u) => URL.revokeObjectURL(u)); }

  preview(f: File) {
    let u = this.previews.get(f);
    if (!u) { u = URL.createObjectURL(f); this.previews.set(f, u); }
    return u;
  }

  addEmoji(e: string) { this.text.set(insertAtCursor(this.ta()?.nativeElement, this.text(), e)); }

  onImages(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).filter((f) => f.type.startsWith('image/'));
    const room = MAX_IMAGES - this.totalImages();
    if (files.length > room) this.toast.warning(`Máximo ${MAX_IMAGES} imágenes por publicación`);
    this.newImages.update((l) => [...l, ...files.slice(0, Math.max(0, room))]);
    input.value = '';
  }

  onVideo(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (f.size > MAX_VIDEO_MB * 1024 * 1024) { this.toast.warning(`El video pesa más de ${MAX_VIDEO_MB} MB`); return; }
    if (this.video()) this.removed.push(this.video()!);
    this.video.set(null);
    this.newVideo.set(f);
  }

  removeImage(url: string) { this.images.update((l) => l.filter((u) => u !== url)); this.removed.push(url); }
  removeNewImage(i: number) { this.newImages.update((l) => l.filter((_, idx) => idx !== i)); }
  removeVideo() { if (this.video()) this.removed.push(this.video()!); this.video.set(null); this.newVideo.set(null); }

  async tryClose() {
    if (this.saving()) return;
    if (this.dirty() && !(await this.dialog.confirm({ title: '¿Descartar los cambios?', message: 'Lo que escribiste no se guardará.', confirmLabel: 'Descartar', cancelLabel: 'Seguir editando', danger: true }))) return;
    this.closed.emit();
  }

  async save() {
    if (!this.canSave()) return;
    this.saving.set(true);
    try {
      const uploaded: string[] = [];
      for (const f of this.newImages()) uploaded.push(await this.community.uploadImage(f, 'post-media'));
      const videoUrl = this.newVideo() ? await this.community.uploadVideo(this.newVideo()!) : this.video();
      const images = [...this.images(), ...uploaded];
      const p = this.post();
      if (p?.id) {
        await this.community.updatePost(p.id, { content: this.text().trim(), images, video: videoUrl ?? null }, this.removed);
        this.toast.success('Publicación actualizada');
      } else {
        const me = this.community.getCurrentUser();
        if (!me) throw new Error('Necesitas iniciar sesión.');
        await this.community.createPost({ authorId: me.uid, content: this.text().trim(), images, video: videoUrl ?? undefined });
        this.toast.success('Publicado');
      }
      this.saved.emit();
    } catch (e) {
      console.error(e);
      this.toast.error(this.post() ? 'No se pudo guardar' : 'No se pudo publicar', (e as Error)?.message || 'Revisa tu conexión e intenta de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }
}
