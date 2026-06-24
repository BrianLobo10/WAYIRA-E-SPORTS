import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FirebaseService, Tournament } from '../../../services/firebase.service';

@Component({
  selector: 'app-tournament-history',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './tournament-history.component.html',
  styleUrl: './tournament-history.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TournamentHistoryComponent implements OnInit {
  private firebase = inject(FirebaseService);

  loading = signal(true);
  tournaments = signal<Tournament[]>([]);
  error = signal<string | null>(null);

  ngOnInit() {
    this.firebase.getFinishedTournaments().subscribe({
      next: rows => {
        this.tournaments.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el historial.');
        this.loading.set(false);
      }
    });
  }

  formatDate(t: Tournament): string {
    const ts = t.finishedAt ?? t.endDate;
    if (!ts?.toDate) return '—';
    return ts.toDate().toLocaleString('es', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }
}
