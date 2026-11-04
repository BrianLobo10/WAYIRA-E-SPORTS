import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService, type ProjectDraft, type ProjectRow } from '../../services/admin.service';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';
import { SvgIconComponent } from '../../components/svg-icon/svg-icon.component';

const ICONS = ['trophy', 'graduation', 'video', 'handshake', 'rocket', 'users', 'target', 'star', 'shield', 'globe', 'lightbulb', 'sparkles', 'document'];
const STATUS_PRESETS = ['Activo', 'En curso', 'Próximamente', 'Pausado', 'Finalizado'];

const blank = (sortOrder: number): ProjectDraft => ({
  title: '', description: '', icon: 'trophy', statusLabel: 'Activo', period: String(new Date().getFullYear()),
  imageUrls: [], linkUrl: null, active: true, sortOrder,
});

@Component({
  selector: 'app-staff-projects',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, SvgIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./admin-ui.css'],
  templateUrl: './staff-projects.component.html',
  styles: [`
    .order { display: inline-flex; flex-direction: column; }
    .order .icon-btn { width: 28px; height: 22px; }
    .thumb { width: 56px; height: 40px; border-radius: 2px; object-fit: cover; background: var(--surface-3); display: grid; place-items: center; color: var(--text-muted); }
    .thumb svg-icon { width: 20px; height: 20px; }
    tr.is-off .cell-title { color: var(--text-secondary); }
    .icons { display: flex; flex-wrap: wrap; gap: 6px; }
    .icons button {
      width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: 2px; cursor: pointer;
      background: var(--bg); color: var(--text-secondary); box-shadow: inset 0 0 0 1px var(--border);
    }
    .icons button.is-on { color: var(--volt-ink); background: var(--volt); box-shadow: none; }
    .icons button:focus-visible { outline: 2px solid var(--volt); outline-offset: 2px; }
    .imgs { display: flex; flex-wrap: wrap; gap: 8px; }
    .img { position: relative; width: 104px; height: 72px; }
    .img img { width: 100%; height: 100%; object-fit: cover; border-radius: 2px; }
    .img .icon-btn { position: absolute; top: 2px; right: 2px; width: 26px; height: 26px; background: rgba(18,18,17,.85); }
    .add-img {
      width: 104px; height: 72px; display: grid; place-items: center; border-radius: 2px; cursor: pointer;
      color: var(--text-secondary); box-shadow: inset 0 0 0 1px var(--border-strong); background: var(--bg); font-size: 12px; text-align: center;
    }
    .add-img:hover { color: var(--white); }
    .add-img input { position: absolute; width: 1px; height: 1px; opacity: 0; }
    .add-img:focus-within { outline: 2px solid var(--volt); outline-offset: 2px; }
    .preview { padding: 16px; border-radius: 2px; background: var(--bg); box-shadow: inset 0 0 0 1px var(--border); }
    .preview__img { width: 100%; aspect-ratio: 16 / 7; object-fit: cover; border-radius: 2px; margin-bottom: 12px; }
    .preview__icon { width: 36px; height: 36px; color: var(--volt); }
    .preview h4 { margin: 10px 0 6px; font-size: 18px; font-weight: 600; }
    .preview p { margin: 0; font-size: 14px; line-height: 1.55; color: var(--text-secondary); }
    .preview__meta { display: flex; gap: 8px; margin-top: 12px; }
    .editor { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 20px; }
    @media (max-width: 760px) { .editor { grid-template-columns: 1fr; } }
  `],
})
export class StaffProjectsComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private readonly sheet = viewChild.required<ElementRef<HTMLDialogElement>>('sheet');

  readonly icons = ICONS;
  readonly statusPresets = STATUS_PRESETS;
  readonly items = signal<ProjectRow[]>([]);
  readonly loading = signal(true);
  readonly busy = signal<string | null>(null);
  readonly activeCount = computed(() => this.items().filter((p) => p.active).length);

  readonly editingId = signal<string | null>(null);
  readonly draft = signal<ProjectDraft>(blank(0));
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly titleError = computed(() => {
    const t = this.draft().title.trim();
    return t.length === 0 ? 'Escribe un título.' : t.length < 3 ? 'Mínimo 3 caracteres.' : '';
  });
  readonly linkError = computed(() => {
    const l = this.draft().linkUrl?.trim();
    return l && !l.startsWith('https://') ? 'El enlace debe empezar por https://' : '';
  });
  readonly touched = signal(false);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.admin.listProjects());
    } catch (e) {
      this.toast.error('No se pudieron cargar los proyectos', e instanceof Error ? e.message : undefined);
    } finally {
      this.loading.set(false);
    }
  }

  openNew() {
    const next = Math.max(0, ...this.items().map((p) => p.sortOrder)) + 1;
    this.editingId.set(null);
    this.draft.set(blank(next));
    this.openSheet();
  }

  openEdit(p: ProjectRow) {
    this.editingId.set(p.id);
    const { id: _id, updatedAt: _u, ...rest } = p;
    this.draft.set({ ...rest, imageUrls: [...p.imageUrls] });
    this.openSheet();
  }

  private openSheet() {
    this.touched.set(false);
    this.sheet().nativeElement.showModal();
  }

  closeSheet() {
    this.sheet().nativeElement.close();
  }

  patch(p: Partial<ProjectDraft>) {
    this.draft.update((d) => ({ ...d, ...p }));
  }

  async onFiles(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const room = 6 - this.draft().imageUrls.length;
    if (!files.length) return;
    if (room <= 0) {
      this.toast.warning('Máximo 6 imágenes por proyecto');
      return;
    }
    this.uploading.set(true);
    try {
      for (const f of files.slice(0, room)) {
        const url = await this.admin.uploadProjectImage(f);
        this.draft.update((d) => ({ ...d, imageUrls: [...d.imageUrls, url] }));
      }
      if (files.length > room) this.toast.warning('Solo se subieron ' + room + ' imágenes', 'El máximo por proyecto es 6.');
    } catch (e) {
      this.toast.error('No se pudo subir la imagen', e instanceof Error ? e.message : undefined);
    } finally {
      this.uploading.set(false);
    }
  }

  removeImage(i: number) {
    this.draft.update((d) => ({ ...d, imageUrls: d.imageUrls.filter((_, idx) => idx !== i) }));
  }

  async save() {
    this.touched.set(true);
    if (this.titleError() || this.linkError()) return;
    this.saving.set(true);
    try {
      await this.admin.saveProject(this.editingId(), this.draft());
      this.toast.success(this.editingId() ? 'Proyecto actualizado' : 'Proyecto creado', this.draft().active ? 'Ya se ve en /projects.' : 'Está oculto hasta que lo actives.');
      this.closeSheet();
      await this.load();
    } catch (e) {
      this.toast.error('No se pudo guardar', e instanceof Error ? e.message : undefined);
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(p: ProjectRow) {
    const active = !p.active;
    this.busy.set(p.id);
    this.items.update((l) => l.map((x) => (x.id === p.id ? { ...x, active } : x)));
    try {
      await this.admin.setProjectActive(p.id, active);
      this.toast.success(active ? 'Proyecto visible en la web' : 'Proyecto oculto de la web', p.title);
    } catch (e) {
      this.items.update((l) => l.map((x) => (x.id === p.id ? { ...x, active: !active } : x)));
      this.toast.error('No se pudo cambiar', e instanceof Error ? e.message : undefined);
    } finally {
      this.busy.set(null);
    }
  }

  async move(i: number, dir: -1 | 1) {
    const list = [...this.items()];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const renumbered = list.map((p, idx) => ({ ...p, sortOrder: idx + 1 }));
    const changed = renumbered.filter((p, idx) => p.sortOrder !== this.items()[idx]?.sortOrder || p.id !== this.items()[idx]?.id);
    const prev = this.items();
    this.items.set(renumbered);
    try {
      await this.admin.setProjectOrder(changed.map((p) => ({ id: p.id, sortOrder: p.sortOrder })));
    } catch (e) {
      this.items.set(prev);
      this.toast.error('No se pudo reordenar', e instanceof Error ? e.message : undefined);
    }
  }

  async remove(p: ProjectRow) {
    const ok = await this.dialog.confirm({
      kicker: 'Acción permanente',
      title: `¿Eliminar «${p.title}»?`,
      message: 'Desaparece de la web y del panel. Si solo quieres ocultarlo, desactívalo.',
      confirmLabel: 'Eliminar proyecto',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(p.id);
    try {
      await this.admin.deleteProject(p.id);
      this.items.update((l) => l.filter((x) => x.id !== p.id));
      this.toast.success('Proyecto eliminado', p.title);
    } catch (e) {
      this.toast.error('No se pudo eliminar', e instanceof Error ? e.message : undefined);
    } finally {
      this.busy.set(null);
    }
  }
}
