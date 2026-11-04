import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AdminService, STATUS_LABELS, type GiveawayAdminRow, type TournamentAdminRow } from '../../services/admin.service';
import { ToastService } from '../../services/toast.service';

/**
 * Torneos y sorteos oficiales: visión de conjunto con acceso directo a su gestión completa
 * (crear, inscripciones, bracket y sorteo viven en /tournaments y /sorteos).
 */
@Component({
  selector: 'app-staff-events',
  standalone: true,
  imports: [DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./admin-ui.css'],
  template: `
    @if (kind === 'torneos') {
      <header class="view-head">
        <div>
          <p class="view-kicker">Competición</p>
          <h1 class="view-title">Torneos</h1>
          <p class="view-lead">Estado e inscripciones de cada torneo. Crear, aprobar equipos y llevar el bracket se hace en la página de torneos.</p>
        </div>
        <div class="view-actions"><a class="btn btn-primary" routerLink="/tournaments"><span class="material-icons" aria-hidden="true">add</span>Gestionar torneos</a></div>
      </header>
      <section class="panel">
        <div class="panel__head"><h2 class="panel__title">{{ activeT() }} activos · {{ tournaments().length }} en total</h2></div>
        @if (loading()) { <div class="panel__body"><div class="skeleton" style="width: 60%"></div></div> } @else {
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Torneo</th><th>Estado</th><th class="num">Equipos</th><th class="actions"><span class="sr-only">Acciones</span></th></tr></thead>
              <tbody>
                @for (t of tournaments(); track t.id) {
                  <tr>
                    <td><span class="cell-title">{{ t.name }}</span><span class="cell-sub">{{ t.startDate ? (t.startDate | date: 'd MMM y') : 'Sin fecha' }}</span></td>
                    <td><span class="badge" [class.badge--on]="t.status === 'ongoing'" [class.badge--warn]="t.status === 'upcoming'">{{ label(t.status) }}</span></td>
                    <td class="num tabular-score">{{ t.teams }}{{ t.maxTeams ? ' / ' + t.maxTeams : '' }}</td>
                    <td class="actions">
                      <a class="btn btn-quiet btn-sm" [routerLink]="['/tournaments', t.id, 'vista-interactiva']">Bracket</a>
                    </td>
                  </tr>
                } @empty { <tr><td colspan="4" class="empty">Aún no hay torneos.</td></tr> }
              </tbody>
            </table>
          </div>
        }
      </section>
    } @else {
      <header class="view-head">
        <div>
          <p class="view-kicker">Comunidad</p>
          <h1 class="view-title">Sorteos oficiales</h1>
          <p class="view-lead">Participantes y estado de cada sorteo. Crear, abrir y sortear se hace en la página de sorteos; el resultado lo decide la base de datos.</p>
        </div>
        <div class="view-actions"><a class="btn btn-primary" routerLink="/sorteos"><span class="material-icons" aria-hidden="true">add</span>Gestionar sorteos</a></div>
      </header>
      <section class="panel">
        <div class="panel__head"><h2 class="panel__title">{{ openG() }} abiertos · {{ giveaways().length }} en total</h2></div>
        @if (loading()) { <div class="panel__body"><div class="skeleton" style="width: 60%"></div></div> } @else {
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Sorteo</th><th>Estado</th><th class="num">Participantes</th><th class="num">Ganadores</th><th>Cierra</th></tr></thead>
              <tbody>
                @for (g of giveaways(); track g.id) {
                  <tr>
                    <td><span class="cell-title">{{ g.title }}</span><span class="cell-sub">{{ g.entryMode === 'list' ? 'Lista cargada por el staff' : 'Inscripción de usuarios' }}</span></td>
                    <td><span class="badge" [class.badge--on]="g.status === 'open'" [class.badge--warn]="g.status === 'draft'">{{ label(g.status) }}</span></td>
                    <td class="num tabular-score">{{ g.entries }}</td>
                    <td class="num tabular-score">{{ g.winnersCount }}</td>
                    <td class="muted">{{ g.closesAt ? (g.closesAt | date: 'd MMM, h:mm a') : '—' }}</td>
                  </tr>
                } @empty { <tr><td colspan="5" class="empty">Aún no hay sorteos.</td></tr> }
              </tbody>
            </table>
          </div>
        }
      </section>
    }
  `,
})
export class StaffEventsComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);
  readonly kind: 'torneos' | 'sorteos' = inject(ActivatedRoute).snapshot.data['kind'] ?? 'torneos';
  readonly tournaments = signal<TournamentAdminRow[]>([]);
  readonly giveaways = signal<GiveawayAdminRow[]>([]);
  readonly loading = signal(true);
  readonly activeT = computed(() => this.tournaments().filter((t) => t.status === 'upcoming' || t.status === 'ongoing').length);
  readonly openG = computed(() => this.giveaways().filter((g) => g.status === 'open').length);

  async ngOnInit() {
    try {
      if (this.kind === 'torneos') this.tournaments.set(await this.admin.listTournaments());
      else this.giveaways.set(await this.admin.listGiveaways());
    } catch (e) {
      this.toast.error('No se pudo cargar la lista', e instanceof Error ? e.message : undefined);
    } finally {
      this.loading.set(false);
    }
  }

  label(s: string): string {
    return STATUS_LABELS[s] ?? s;
  }
}
