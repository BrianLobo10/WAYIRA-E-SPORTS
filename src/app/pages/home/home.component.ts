import { AfterViewInit, Component, ElementRef, NgZone, OnInit, OnDestroy, PLATFORM_ID, ViewChild, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { gsap } from 'gsap';
import { Subscription } from 'rxjs';
import { Timestamp } from '../../utils/timestamp';
import { TwitchEmbedComponent } from '../../components/twitch-embed/twitch-embed.component';
import { CommunitySectionComponent } from '../../components/community-section/community-section.component';
import type { Tournament } from '../../models';
import { TournamentService } from '../../services/tournament.service';
import { AuthService } from '../../services/auth.service';
import { TwitchLiveService } from '../../services/twitch-live.service';
import { SOCIAL_LINKS } from '../../config/social.config';
import { RevealDirective } from '../../directives/reveal.directive';

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
  imports: [RouterLink, CommonModule, TwitchEmbedComponent, CommunitySectionComponent, RevealDirective],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('hero', { static: true }) heroRef!: ElementRef<HTMLElement>;

  private tournamentApi = inject(TournamentService);
  private auth = inject(AuthService);
  private zone = inject(NgZone);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private heroMotion?: gsap.MatchMedia;
  private twitchLive = inject(TwitchLiveService);
  private subscriptions = new Subscription();

  tournaments = signal<Tournament[]>([]);
  loadingTournaments = signal(true);
  readonly isAuthenticated = this.auth.isAuthenticated;

  readonly twitchUrl = SOCIAL_LINKS.twitch;
  readonly skeletons = [0, 1, 2];

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
      this.tournamentApi.getTournaments().subscribe({
        next: (list) => {
          this.tournaments.set(list);
          this.loadingTournaments.set(false);
        },
        error: () => this.loadingTournaments.set(false)
      })
    );
  }

  ngAfterViewInit() {
    if (!this.isBrowser) return;
    this.zone.runOutsideAngular(() => {
      this.heroMotion = gsap.matchMedia();
      this.heroMotion.add('(prefers-reduced-motion: no-preference)', () => {
        const q = gsap.utils.selector(this.heroRef.nativeElement);
        gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.7 } })
          .from(q('[data-hero="eyebrow"]'), { autoAlpha: 0, y: 10, duration: 0.5 })
          .from(q('[data-hero="line"]'), { yPercent: 110, duration: 0.7, stagger: 0.07, ease: 'power4.out' }, '<0.05')
          .from(q('[data-hero="sub"]'), { autoAlpha: 0, y: 12 }, '-=0.45')
          .from(q('[data-hero="ctas"] > *'), { autoAlpha: 0, y: 10, stagger: 0.05, duration: 0.5 }, '<0.08')
          .from(q('[data-hero="eagle"]'), { autoAlpha: 0, scale: 0.92, duration: 1.1, ease: 'expo.out' }, 0.15)
          // El marcador volt se "pinta" de izquierda a derecha detrás de las palabras clave
          .fromTo(q('[data-hero="mark"]'), { '--mark-size': '0%' }, { '--mark-size': '100%', duration: 0.6, ease: 'expo.inOut' }, 0.45)
          .set(q('[data-hero]'), { clearProps: 'transform,opacity,visibility' });
      });
    });
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    this.heroMotion?.revert();
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
