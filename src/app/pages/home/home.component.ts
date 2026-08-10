import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import { TwitchEmbedComponent } from '../../components/twitch-embed/twitch-embed.component';
import { CommunitySectionComponent } from '../../components/community-section/community-section.component';
import { FirebaseService, Tournament } from '../../services/firebase.service';
import { TwitchLiveService } from '../../services/twitch-live.service';
import { SOCIAL_LINKS } from '../../config/social.config';
import { User } from '@angular/fire/auth';

interface TournamentCard {
  id: string;
  name: string;
  game: string;
  description: string;
  chipClass: 'chip-live' | 'chip-upcoming' | 'chip-gold';
  bandClass: 'band-live' | 'band-teal' | 'band-gold';
  chipLabel: string;
  prize: string;
  slots: string;
  actionLabel: string;
  actionClass: 'btn-live' | 'btn-primary' | 'btn-secondary';
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, CommonModule, TwitchEmbedComponent, CommunitySectionComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit, OnDestroy {
  private firebaseService = inject(FirebaseService);
  private twitchLive = inject(TwitchLiveService);
  private subscriptions = new Subscription();

  tournaments = signal<Tournament[]>([]);
  loadingTournaments = signal(true);
  isAuthenticated = signal(false);

  readonly twitchUrl = SOCIAL_LINKS.twitch;

  twitchIsLive = this.twitchLive.isLive;

  displayTournaments = computed((): TournamentCard[] => {
    return this.tournaments()
      .filter(t => t.status !== 'finished')
      .slice(0, 3)
      .map(t => this.mapTournament(t));
  });

  hasTournaments = computed(() => this.displayTournaments().length > 0);

  ngOnInit() {
    this.subscriptions.add(
      this.firebaseService.currentUser.subscribe((user: User | null) => {
        this.isAuthenticated.set(!!user);
      })
    );
    this.subscriptions.add(
      this.firebaseService.getTournaments().subscribe({
        next: (list) => {
          this.tournaments.set(list);
          this.loadingTournaments.set(false);
        },
        error: () => this.loadingTournaments.set(false)
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  private mapTournament(t: Tournament): TournamentCard {
    const band = this.getBandClass(t.status);
    return {
      id: t.id || t.name,
      name: t.name,
      game: t.game,
      description: t.description,
      chipClass: band === 'band-live' ? 'chip-live' : band === 'band-gold' ? 'chip-gold' : 'chip-upcoming',
      bandClass: band,
      chipLabel: this.getStatusLabel(t.status),
      prize: 'Premio TBA',
      slots: `${(t.teams || []).length} / ${t.maxTeams} cupos`,
      actionLabel: t.status === 'ongoing' ? 'Ver en vivo' : 'Inscribirse',
      actionClass: t.status === 'ongoing' ? 'btn-live' : 'btn-primary'
    };
  }

  getBandClass(status: Tournament['status']): TournamentCard['bandClass'] {
    switch (status) {
      case 'ongoing': return 'band-live';
      case 'confirmed': return 'band-gold';
      default: return 'band-teal';
    }
  }

  getStatusLabel(status: Tournament['status']): string {
    switch (status) {
      case 'ongoing': return 'En vivo';
      case 'confirmed': return 'Gran premio';
      case 'finished': return 'Finalizado';
      default: return 'Próximo';
    }
  }

  formatDate(date: Timestamp | undefined): string {
    if (!date) return 'Por definir';
    return date.toDate().toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }

  openTwitch() {
    window.open(this.twitchUrl, '_blank', 'noopener');
  }
}
