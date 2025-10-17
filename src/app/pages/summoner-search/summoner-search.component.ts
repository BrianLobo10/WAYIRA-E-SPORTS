import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RiotApiService, SummonerData, LeagueEntry, MatchData, ChampionMastery } from '../../services/riot-api.service';
import { ChampionService } from '../../services/champion.service';

@Component({
  selector: 'app-summoner-search',
  imports: [FormsModule, CommonModule],
  templateUrl: './summoner-search.component.html',
  styleUrl: './summoner-search.component.css'
})
export class SummonerSearchComponent {
  private riotApiService = inject(RiotApiService);
  protected championService = inject(ChampionService);

  gameName = '';
  tagLine = '';
  selectedRegion = 'la1';
  
  loading = signal(false);
  loadingMatches = signal(false);
  summoner = signal<SummonerData | null>(null);
  summonerData = signal<SummonerData | null>(null);
  matches = signal<MatchData[]>([]);
  championMastery = signal<ChampionMastery[]>([]);
  error = signal<string | null>(null);
  selectedQueue = signal<'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR'>('RANKED_SOLO_5x5');
  selectedMatch = signal<MatchData | null>(null);

  regions = [
    { code: 'na1', name: 'NA - América del Norte' },
    { code: 'br1', name: 'BR - Brasil' },
    { code: 'la1', name: 'LAN - Latinoamérica Norte' },
    { code: 'la2', name: 'LAS - Latinoamérica Sur' },
    { code: 'euw1', name: 'EUW - Europa Oeste' },
    { code: 'eun1', name: 'EUNE - Europa Este' },
    { code: 'kr', name: 'KR - Corea' },
    { code: 'jp1', name: 'JP - Japón' }
  ];

  searchSummoner() {
    if (!this.gameName.trim() || !this.tagLine.trim()) {
      this.error.set('Por favor ingresa el nombre del jugador y el tagline');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.summoner.set(null);
    this.summonerData.set(null);
    this.matches.set([]);
    this.championMastery.set([]);

    this.riotApiService.getSummoner(this.selectedRegion, this.gameName.trim(), this.tagLine.trim())
      .subscribe({
        next: (data) => {
          this.summoner.set(data);
          this.summonerData.set(data);
          this.loading.set(false);
          
          this.loadAdditionalData(data.puuid);
        },
        error: (err) => {
          this.loading.set(false);
          if (err.status === 404) {
            this.error.set('Jugador no encontrado. Verifica el nombre y tagline.');
          } else if (err.error?.error) {
            this.error.set(err.error.error);
          } else {
            this.error.set('Error al buscar el jugador. Intenta nuevamente.');
          }
        }
      });
  }

  loadAdditionalData(puuid: string) {
    this.loadingMatches.set(true);
    let matchesLoaded = false;
    let masteryLoaded = false;
    
    const checkComplete = () => {
      if (matchesLoaded && masteryLoaded) {
        this.loadingMatches.set(false);
      }
    };
    
    this.riotApiService.getMatches(this.selectedRegion, puuid, 20).subscribe({
      next: (matches) => {
        this.matches.set(matches);
        matchesLoaded = true;
        checkComplete();
      },
      error: (err) => {
        console.error('Error cargando partidas:', err);
        matchesLoaded = true;
        checkComplete();
      }
    });

    this.riotApiService.getChampionMastery(this.selectedRegion, puuid, 5).subscribe({
      next: (mastery) => {
        this.championMastery.set(mastery);
        masteryLoaded = true;
        checkComplete();
      },
      error: (err) => {
        console.error('Error cargando maestría:', err);
        masteryLoaded = true;
        checkComplete();
      }
    });
  }

  getProfileIconUrl(iconId: number): string {
    return `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${iconId}.png`;
  }

  getRankedQueue(league: LeagueEntry): string {
    const queueMap: { [key: string]: string } = {
      'RANKED_SOLO_5x5': 'Ranked Solo/Duo',
      'RANKED_FLEX_SR': 'Ranked Flex 5v5',
      'RANKED_FLEX_TT': 'Ranked Flex 3v3'
    };
    return queueMap[league.queueType] || league.queueType;
  }

  getRankImageUrl(tier: string): string {
    const tierLower = tier.toLowerCase();
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tierLower}.png`;
  }

  getWinRate(league: LeagueEntry): number {
    const total = league.wins + league.losses;
    return total > 0 ? Math.round((league.wins / total) * 100) : 0;
  }

  getTierColor(tier: string): string {
    const colors: { [key: string]: string } = {
      'IRON': '#6b5854',
      'BRONZE': '#a0715e',
      'SILVER': '#8c9ca4',
      'GOLD': '#f0c800',
      'PLATINUM': '#00a896',
      'EMERALD': '#00c896',
      'DIAMOND': '#5e17eb',
      'MASTER': '#9b4dca',
      'GRANDMASTER': '#e03131',
      'CHALLENGER': '#f7b731'
    };
    return colors[tier] || '#016C6C';
  }

  getChampionImageUrl(championId: number): string {
    const championName = this.championService.getChampionName(championId);
    return `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/${championName}.png`;
  }

  getChampionNameById(championId: number): string {
    return this.championService.getChampionName(championId);
  }

  formatMasteryPoints(points: number): string {
    if (points >= 1000000) {
      return (points / 1000000).toFixed(1) + 'M';
    } else if (points >= 1000) {
      return (points / 1000).toFixed(1) + 'K';
    }
    return points.toString();
  }

  getParticipantData(match: MatchData): any {
    const summonerPuuid = this.summoner()?.puuid;
    return match.info.participants.find(p => p.puuid === summonerPuuid);
  }

  getKDA(participant: any): string {
    const kda = participant.deaths > 0 
      ? ((participant.kills + participant.assists) / participant.deaths).toFixed(2)
      : 'Perfect';
    return kda;
  }

  getMatchDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 7) return `Hace ${days} días`;
    return date.toLocaleDateString();
  }

  getQueueName(queueId: number): string {
    const queueMap: { [key: number]: string } = {
      0: 'Personalizada',
      400: 'Normal',
      420: 'Ranked Solo/Duo',
      430: 'Normal',
      440: 'Ranked Flex',
      450: 'ARAM',
      700: 'Clash',
      830: 'Co-op vs IA',
      840: 'Co-op vs IA',
      850: 'Co-op vs IA',
      900: 'URF',
      1020: 'One For All',
      1300: 'Nexus Blitz',
      1400: 'Ultimate Spellbook',
      1700: 'Arena',
      1900: 'URF'
    };
    return queueMap[queueId] || 'Normal';
  }

  getCurrentLeague(): LeagueEntry | null {
    const data = this.summonerData();
    if (!data?.leagues) return null;
    
    return data.leagues.find((league: LeagueEntry) => league.queueType === this.selectedQueue()) || null;
  }

  getLPProgress(): number {
    const league = this.getCurrentLeague();
    if (!league) return 0;
    
    return Math.min((league.leaguePoints / 100) * 100, 100);
  }

  getLPHistory(): { lp: number, isWin: boolean, date: string }[] {
    const league = this.getCurrentLeague();
    if (!league) return [];
    
    const currentLP = league.leaguePoints;
    const history: { lp: number, isWin: boolean, date: string }[] = [];
    
    let baseLP = Math.max(0, currentLP - 60);
    
    for (let i = 0; i < 12; i++) {
      const progress = i / 11;
      const targetLP = currentLP;
      
      const smoothProgress = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      const lp = Math.round(baseLP + (targetLP - baseLP) * smoothProgress);
      
      const variation = Math.sin(progress * Math.PI * 2) * 8 + (Math.random() - 0.5) * 6;
      const finalLP = Math.max(0, Math.min(100, lp + variation));
      
      const isWin = Math.random() > 0.3;
      
      const date = new Date();
      date.setDate(date.getDate() - (11 - i));
      
      history.push({ 
        lp: Math.round(finalLP), 
        isWin,
        date: date.toISOString()
      });
    }
    
    return history;
  }

  switchQueue(queue: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR') {
    this.selectedQueue.set(queue);
  }

  getQueueDisplayName(queue: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR'): string {
    return queue === 'RANKED_SOLO_5x5' ? 'Solo/Duo' : 'Flex';
  }

  getSmoothPath(): string {
    const history = this.getLPHistory();
    if (history.length < 2) return '';

    let path = '';
    const width = 380;
    const height = 180;
    const padding = 10;

    for (let i = 0; i < history.length; i++) {
      const x = (i / (history.length - 1)) * width + padding;
      const y = 200 - (history[i].lp / 100) * height - padding;

      if (i === 0) {
        path += `M ${x} ${y}`;
      } else {
        const prevX = ((i - 1) / (history.length - 1)) * width + padding;
        const prevY = 200 - (history[i - 1].lp / 100) * height - padding;
        
        const cp1x = prevX + (x - prevX) * 0.3;
        const cp1y = prevY;
        const cp2x = prevX + (x - prevX) * 0.7;
        const cp2y = y;
        
        path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x} ${y}`;
      }
    }

    return path;
  }

  getPointX(index: number): number {
    const history = this.getLPHistory();
    if (history.length === 0) return 0;
    return (index / (history.length - 1)) * 380 + 10;
  }

  getPointY(index: number): number {
    const history = this.getLPHistory();
    if (history.length === 0) return 0;
    return 200 - (history[index].lp / 100) * 180 - 10;
  }

  // Funciones para el modal de detalles de la partida
  openMatchDetails(match: MatchData) {
    this.selectedMatch.set(match);
  }

  closeMatchDetails() {
    this.selectedMatch.set(null);
  }

  getTeamPlayers(match: MatchData, teamId: number): any[] {
    return match.info.participants.filter(participant => participant.teamId === teamId);
  }

  getTeamWon(match: MatchData, teamId: number): boolean {
    const teamPlayers = this.getTeamPlayers(match, teamId);
    return teamPlayers.length > 0 && teamPlayers[0].win;
  }

  searchPlayer(playerName: string) {
    // Extraer nombre y tagline del nombre del jugador
    const parts = playerName.split('#');
    if (parts.length === 2) {
      this.gameName = parts[0];
      this.tagLine = parts[1];
    } else {
      // Si no tiene tagline, usar el nombre completo y un tagline por defecto
      this.gameName = playerName;
      this.tagLine = 'NA1'; // Tagline por defecto
    }
    
    // Cerrar el modal y buscar
    this.closeMatchDetails();
    this.searchSummoner();
  }
}

