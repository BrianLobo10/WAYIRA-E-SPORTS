import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { RiotApiService, SummonerData, LeagueEntry, MatchData, ChampionMastery } from '../../services/riot-api.service';
import { ChampionService } from '../../services/champion.service';

/** Nombres de las colas de Riot (https://static.developer.riotgames.com/docs/lol/queues.json) */
const QUEUE_NAMES: Record<number, string> = {
  420: 'Ranked Solo/Duo', 440: 'Ranked Flex', 400: 'Normal (reclutamiento)', 430: 'Normal (a ciegas)',
  480: 'Partida rápida', 490: 'Normal (juego rápido)', 450: 'ARAM', 2400: 'ARAM: Caos', 720: 'ARAM Clash',
  700: 'Clash', 1700: 'Arena', 1710: 'Arena', 900: 'URF', 1900: 'URF', 1010: 'URF de nieve', 1020: 'Uno para todos',
  1300: 'Nexus Blitz', 1400: 'Libro de hechizos', 2300: 'Brawl', 830: 'Coop vs IA', 840: 'Coop vs IA', 850: 'Coop vs IA',
  870: 'Coop vs IA', 880: 'Coop vs IA', 890: 'Coop vs IA', 1810: 'Swarm', 1820: 'Swarm', 1830: 'Swarm', 1840: 'Swarm',
  0: 'Personalizada',
};

export interface ModeSummary { name: string; games: number; wins: number; losses: number; winrate: number; kda: string }

@Component({
  selector: 'app-summoner-search',
  imports: [FormsModule, CommonModule],
  templateUrl: './summoner-search.component.html',
  styleUrl: './summoner-search.component.css'
})
export class SummonerSearchComponent implements OnInit {
  private riotApiService = inject(RiotApiService);
  private route = inject(ActivatedRoute);
  protected championService = inject(ChampionService);

  gameName = '';
  tagLine = '';
  riotId = '';
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

  /** Filtro del historial por modo ('Todos' = sin filtro) */
  modeFilter = signal('Todos');
  loadingMore = signal(false);
  /** Riot devolvió menos de las pedidas: ya no hay más partidas */
  noMoreMatches = signal(false);
  private readonly pageSize = 20;

  /** Victorias y derrotas por modo, calculadas con las partidas cargadas (todas las colas, no solo ranked) */
  modeSummary = computed<ModeSummary[]>(() => {
    const groups = new Map<string, { games: number; wins: number; k: number; d: number; a: number }>();
    for (const m of this.matches()) {
      const p = this.getParticipantData(m);
      if (!p) continue;
      const name = this.getQueueName(m.info.queueId, m.info.gameMode);
      const g = groups.get(name) ?? { games: 0, wins: 0, k: 0, d: 0, a: 0 };
      g.games++; if (p.win) g.wins++; g.k += p.kills; g.d += p.deaths; g.a += p.assists;
      groups.set(name, g);
    }
    return [...groups.entries()]
      .map(([name, g]) => ({
        name, games: g.games, wins: g.wins, losses: g.games - g.wins,
        winrate: Math.round((g.wins / g.games) * 100),
        kda: ((g.k + g.a) / Math.max(1, g.d)).toFixed(2),
      }))
      .sort((a, b) => b.games - a.games);
  });

  filteredMatches = computed(() => {
    const f = this.modeFilter();
    return f === 'Todos' ? this.matches() : this.matches().filter((m) => this.getQueueName(m.info.queueId, m.info.gameMode) === f);
  });

  /** Cache en sesión: misma búsqueda no vuelve a llamar a la API */
  private searchCache: { key: string; data: SummonerData; matches: MatchData[]; mastery: ChampionMastery[] } | null = null;

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      const region = params['region'];
      const gameName = params['gameName'];
      const tagLine = params['tagLine'];
      const riotId = params['riotId'];
      if (region) this.selectedRegion = region;
      if (riotId) {
        this.riotId = riotId;
        const parts = riotId.split('#');
        if (parts.length === 2) {
          this.gameName = parts[0].trim();
          this.tagLine = parts[1].trim();
        }
      }
      if (gameName) this.gameName = gameName;
      if (tagLine) this.tagLine = tagLine;
      if (this.gameName && this.tagLine && !this.riotId) this.riotId = `${this.gameName}#${this.tagLine}`;
      if (this.gameName?.trim() && this.tagLine?.trim()) {
        setTimeout(() => this.searchSummoner(), 0);
      }
    });
  }

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
    const riotIdMatch = this.riotId.trim().match(/^(.+?)#([^#]+)$/);
    if (riotIdMatch) {
      this.gameName = riotIdMatch[1].trim();
      this.tagLine = riotIdMatch[2].trim();
    }
    if (!this.gameName.trim() || !this.tagLine.trim()) {
      this.error.set('Ingresa el Riot ID con formato Nombre#TAG');
      return;
    }

    const cacheKey = `${this.selectedRegion}:${this.gameName.trim().toLowerCase()}:${this.tagLine.trim().toLowerCase()}`;
    if (this.searchCache?.key === cacheKey) {
      this.summoner.set(this.searchCache.data);
      this.summonerData.set(this.searchCache.data);
      this.matches.set(this.searchCache.matches);
      this.championMastery.set(this.searchCache.mastery);
      this.error.set(null);
      this.loading.set(false);
      this.loadingMatches.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.summoner.set(null);
    this.summonerData.set(null);
    this.matches.set([]);
    this.championMastery.set([]);
    this.searchCache = null;

    this.riotApiService.getSummoner(this.selectedRegion, this.gameName.trim(), this.tagLine.trim())
      .subscribe({
        next: (data) => {
          this.summoner.set(data);
          this.summonerData.set(data);
          this.loading.set(false);
          this.loadAdditionalData(data.puuid, cacheKey, data);
        },
        error: (err) => {
          this.loading.set(false);
          if (err.status === 404) {
            this.error.set('Jugador no encontrado. Verifica el nombre y tagline.');
          } else if (err.status === 401 || err.status === 403 || err.status === 503) {
            this.error.set('El servicio de búsqueda de jugadores no está disponible en este momento. Por favor, intenta más tarde.');
          } else if (err.error?.error) {
            // Verificar si el mensaje contiene información técnica y reemplazarlo
            const errorMsg = err.error.error;
            if (errorMsg.includes('API key') || errorMsg.includes('Forbidden') || errorMsg.includes('portal de desarrolladores')) {
              this.error.set('El servicio de búsqueda de jugadores no está disponible en este momento. Por favor, intenta más tarde.');
            } else {
              this.error.set(errorMsg);
            }
          } else {
            this.error.set('El servicio de búsqueda de jugadores no está disponible en este momento. Por favor, intenta más tarde.');
          }
        }
      });
  }

  loadAdditionalData(puuid: string, cacheKey?: string, summonerData?: SummonerData) {
    this.loadingMatches.set(true);
    let matchesLoaded = false;
    let masteryLoaded = false;
    let matchesResult: MatchData[] = [];
    let masteryResult: ChampionMastery[] = [];

    const checkComplete = () => {
      if (matchesLoaded && masteryLoaded) {
        this.loadingMatches.set(false);
        if (cacheKey && summonerData) {
          this.searchCache = { key: cacheKey, data: summonerData, matches: matchesResult, mastery: masteryResult };
        }
      }
    };

    // Una sola consulta con todos los modos (antes eran dos y se agotaba el límite de la clave de Riot)
    this.modeFilter.set('Todos');
    this.noMoreMatches.set(false);
    this.riotApiService.getMatches(this.selectedRegion, puuid, this.pageSize, 0).subscribe({
      next: (list) => {
        matchesResult = [...list].sort((a, b) => b.info.gameCreation - a.info.gameCreation);
        this.noMoreMatches.set(list.length < this.pageSize);
        this.matches.set(matchesResult);
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
        masteryResult = mastery;
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

  /** Siguientes 20 partidas (más antiguas) */
  loadMoreMatches() {
    const data = this.summonerData();
    if (!data || this.loadingMore() || this.noMoreMatches()) return;
    this.loadingMore.set(true);
    this.riotApiService.getMatches(this.selectedRegion, data.puuid, this.pageSize, this.matches().length).subscribe({
      next: (list) => {
        const seen = new Set(this.matches().map((m) => m.metadata.matchId));
        const merged = [...this.matches(), ...list.filter((m) => !seen.has(m.metadata.matchId))]
          .sort((a, b) => b.info.gameCreation - a.info.gameCreation);
        this.matches.set(merged);
        this.noMoreMatches.set(list.length < this.pageSize);
        if (this.searchCache) this.searchCache.matches = merged;
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  getProfileIconUrl(iconId: number): string {
    return `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${iconId}.png`;
  }

  getRankedQueue(queueType: string): string {
    const queueMap: { [key: string]: string } = {
      'RANKED_SOLO_5x5': 'Ranked Solo/Duo',
      'RANKED_FLEX_SR': 'Ranked Flex 5v5',
      'RANKED_FLEX_TT': 'Ranked Flex 3v3'
    };
    return queueMap[queueType] || queueType;
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
    return colors[tier] || '#6366f1';
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

  getQueueName(queueId: number, gameMode?: string): string {
    if (QUEUE_NAMES[queueId]) return QUEUE_NAMES[queueId];
    // Colas nuevas o de evento: se nombran por el modo de juego
    const mode = (gameMode ?? '').toUpperCase();
    if (mode === 'ARAM') return 'ARAM';
    if (mode === 'CHERRY') return 'Arena';
    if (mode === 'URF' || mode === 'ARURF') return 'URF';
    if (mode === 'ONEFORALL') return 'Uno para todos';
    if (mode === 'CLASSIC') return 'Normal';
    return mode ? mode.charAt(0) + mode.slice(1).toLowerCase() : 'Otro modo';
  }

  getLeague(queueType: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR'): LeagueEntry | null {
    return this.summonerData()?.leagues.find((league) => league.queueType === queueType) ?? null;
  }

  getCurrentLeague(): LeagueEntry | null {
    const data = this.summonerData();
    if (!data?.leagues) return null;
    
    return data.leagues.find((league: LeagueEntry) => league.queueType === this.selectedQueue()) || null;
  }

  getLeagueDisplayName(league: LeagueEntry | null): string {
    if (!league) return 'Sin clasificar';
    const tier = league.tier || '';
    const rank = league.rank || '';
    if (tier === 'MASTER' || tier === 'GRANDMASTER' || tier === 'CHALLENGER') {
      return `${tier}`;
    }
    return `${tier} ${rank}`.trim();
  }

  getLPProgress(): number {
    const league = this.getCurrentLeague();
    if (!league) return 0;
    
    return Math.min((league.leaguePoints / 100) * 100, 100);
  }

  switchQueue(queue: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR') {
    this.selectedQueue.set(queue);
  }

  getQueueDisplayName(queue: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR'): string {
    return queue === 'RANKED_SOLO_5x5' ? 'Solo/Duo' : 'Flex';
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
