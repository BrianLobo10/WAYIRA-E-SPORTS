import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { FirebaseService, PlayerInfo, Team, Tournament } from '../../../services/firebase.service';

@Component({
  selector: 'app-tournament-history-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './tournament-history-detail.component.html',
  styleUrl: './tournament-history-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TournamentHistoryDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private firebase = inject(FirebaseService);

  loading = signal(true);
  tournament = signal<Tournament | null>(null);
  error = signal<string | null>(null);
  /** Equipo seleccionado para ver jugadores */
  selectedTeam = signal<Team | null>(null);
  /** Torneos ganados por equipo (por id) */
  teamWins = signal<Record<string, number>>({});

  modalOpen = computed(() => this.selectedTeam() !== null);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('tournamentId');
    if (!id) {
      this.error.set('Torneo no encontrado');
      this.loading.set(false);
      return;
    }
    this.firebase.getTournamentById(id).subscribe({
      next: async t => {
        if (!t || t.status !== 'finished') {
          this.error.set(!t ? 'No existe este torneo.' : 'Este torneo aún no está en el historial (no finalizado).');
          this.loading.set(false);
          return;
        }
        this.tournament.set(t);
        const teams = t.teams || [];
        const wins: Record<string, number> = {};
        for (const team of teams) {
          try {
            const stats = await firstValueFrom(this.firebase.getTeamTournamentStats(team.id));
            wins[team.id] = stats?.tournamentsWon ?? 0;
          } catch {
            wins[team.id] = 0;
          }
        }
        this.teamWins.set(wins);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Error al cargar.');
        this.loading.set(false);
      }
    });
  }

  openTeam(team: Team) {
    this.selectedTeam.set(team);
  }

  closeModal() {
    this.selectedTeam.set(null);
  }

  playersList(team: Team): PlayerInfo[] {
    return team.playerInfo?.length ? team.playerInfo : [];
  }

  formatDate(t: Tournament): string {
    const ts = t.finishedAt ?? t.endDate;
    if (!ts?.toDate) return '—';
    return ts.toDate().toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' });
  }

  winsFor(teamId: string): number {
    return this.teamWins()[teamId] ?? 0;
  }
}
