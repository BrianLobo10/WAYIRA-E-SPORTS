import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminService, type NewsAdminRow } from '../../services/admin.service';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';

/** Noticias: publicar, despublicar y retirar. Redactar y editar el texto se hace en /news. */
@Component({
  selector: 'app-staff-news',
  standalone: true,
  imports: [DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./admin-ui.css'],
  template: `
    <header class="view-head">
      <div>
        <p class="view-kicker">Contenido</p>
        <h1 class="view-title">Noticias</h1>
        <p class="view-lead">Publica o retira noticias. Para escribir o editar el texto, abre la página de noticias.</p>
      </div>
      <div class="view-actions">
        <a class="btn btn-primary" routerLink="/news"><span class="material-icons" aria-hidden="true">edit</span>Redactar en Noticias</a>
      </div>
    </header>

    <section class="panel">
      <div class="panel__head">
        <h2 class="panel__title">{{ published() }} publicadas · {{ items().length - published() }} borradores</h2>
        <div class="toolbar" style="margin: 0" role="group" aria-label="Filtro">
          <button type="button" class="btn btn-sm" [class.btn-primary]="filter() === 'all'" [class.btn-quiet]="filter() !== 'all'" (click)="filter.set('all')">Todas</button>
          <button type="button" class="btn btn-sm" [class.btn-primary]="filter() === 'draft'" [class.btn-quiet]="filter() !== 'draft'" (click)="filter.set('draft')">Borradores</button>
        </div>
      </div>
      @if (loading()) {
        <div class="panel__body"><div class="skeleton" style="width: 60%"></div></div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Noticia</th><th>Categoría</th><th>Estado</th><th class="actions"><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              @for (n of visible(); track n.id) {
                <tr>
                  <td><span class="cell-title">{{ n.title }}</span><span class="cell-sub">{{ n.authorName }} · {{ n.createdAt | date: 'd MMM y' }}</span></td>
                  <td class="muted">{{ n.category }}</td>
                  <td><span class="badge" [class.badge--on]="n.published">{{ n.published ? 'Publicada' : 'Borrador' }}</span></td>
                  <td class="actions">
                    <button type="button" class="btn btn-quiet btn-sm" [disabled]="busy() === n.id" (click)="togglePublished(n)">{{ n.published ? 'Despublicar' : 'Publicar' }}</button>
                    <button type="button" class="icon-btn is-danger" [disabled]="busy() === n.id" (click)="remove(n)" [attr.aria-label]="'Eliminar ' + n.title"><span class="material-icons" aria-hidden="true">delete</span></button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="empty">{{ filter() === 'draft' ? 'No hay borradores.' : 'Aún no hay noticias.' }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class StaffNewsComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  readonly items = signal<NewsAdminRow[]>([]);
  readonly loading = signal(true);
  readonly busy = signal<string | null>(null);
  readonly filter = signal<'all' | 'draft'>('all');
  readonly published = computed(() => this.items().filter((n) => n.published).length);
  readonly visible = computed(() => (this.filter() === 'draft' ? this.items().filter((n) => !n.published) : this.items()));

  async ngOnInit() {
    try {
      this.items.set(await this.admin.listNews());
    } catch (e) {
      this.toast.error('No se pudieron cargar las noticias', e instanceof Error ? e.message : undefined);
    } finally {
      this.loading.set(false);
    }
  }

  async togglePublished(n: NewsAdminRow) {
    const published = !n.published;
    if (!published) {
      const ok = await this.dialog.confirm({ title: `¿Despublicar «${n.title}»?`, message: 'Deja de verse en la web y vuelve a borradores.', confirmLabel: 'Despublicar' });
      if (!ok) return;
    }
    this.busy.set(n.id);
    try {
      await this.admin.setNewsPublished(n.id, published);
      this.items.update((l) => l.map((x) => (x.id === n.id ? { ...x, published } : x)));
      this.toast.success(published ? 'Noticia publicada' : 'Noticia despublicada', n.title);
    } catch (e) {
      this.toast.error('No se pudo cambiar', e instanceof Error ? e.message : undefined);
    } finally {
      this.busy.set(null);
    }
  }

  async remove(n: NewsAdminRow) {
    const ok = await this.dialog.confirm({ kicker: 'Acción permanente', title: `¿Eliminar «${n.title}»?`, message: 'Se borra para siempre. Si solo quieres ocultarla, despublícala.', confirmLabel: 'Eliminar noticia', danger: true });
    if (!ok) return;
    this.busy.set(n.id);
    try {
      await this.admin.deleteNews(n.id);
      this.items.update((l) => l.filter((x) => x.id !== n.id));
      this.toast.success('Noticia eliminada', n.title);
    } catch (e) {
      this.toast.error('No se pudo eliminar', e instanceof Error ? e.message : undefined);
    } finally {
      this.busy.set(null);
    }
  }
}
