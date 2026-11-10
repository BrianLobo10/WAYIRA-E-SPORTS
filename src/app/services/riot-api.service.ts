import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Consultas a Riot a través de la función de Supabase (la clave de Riot vive solo en el servidor). */
const riotUrl = (path: string) => `${environment.supabase.functionsUrl}/riot${path}`;
const seg = encodeURIComponent;

export interface SummonerData {
  id: string;
  accountId: string;
  puuid: string;
  name: string;
  gameName: string;
  tagLine: string;
  profileIconId: number;
  summonerLevel: number;
  leagues: LeagueEntry[];
}

/** Partida reducida guardada en Supabase (dashboard de estadísticas) */
export interface SlimParticipant {
  puuid: string; name: string; tag: string; champ: string; champId: number; team: number; win: boolean; pos: string;
  k: number; d: number; a: number; cs: number; gold: number; dmg: number; taken: number; heal: number;
  vision: number; wards: number; wardsKilled: number; barons: number; dragons: number; turrets: number;
  multi: number; spree: number; level: number; firstBlood: boolean; pentas: number;
}
export interface SlimMatch {
  id: string; created: number; duration: number; queue: number; mode: string;
  teamKills: Record<string, number>; participants: SlimParticipant[];
}
export interface SyncStatus { busy: boolean; limited: boolean; pending: number | null; stored: number | null; total: number | null }

export interface LeagueEntry {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

export interface MatchData {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameCreation: number;
    gameDuration: number;
    gameMode: string;
    queueId: number;
    participants: ParticipantData[];
  };
}

export interface ParticipantData {
  puuid: string;
  summonerName: string;
  championName: string;
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  teamId: number;
  totalMinionsKilled: number;
  goldEarned: number;
  champLevel: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
}

export interface ChampionMastery {
  championId: number;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number;
  championPointsSinceLastLevel: number;
  championPointsUntilNextLevel: number;
  tokensEarned: number;
  worldRank?: number;
  serverRank?: number;
}

@Injectable({
  providedIn: 'root'
})
export class RiotApiService {
  private http = inject(HttpClient);

  getSummoner(region: string, gameName: string, tagLine: string): Observable<SummonerData> {
    return this.http.get<SummonerData>(
      riotUrl(`/summoner/${seg(region)}/${seg(gameName)}/${seg(tagLine)}`)
    );
  }

  /** Partidas de todos los modos (ranked, ARAM, ARAM: Caos, Arena, normales...). `start` pagina hacia atrás. */
  getMatches(region: string, puuid: string, count: number = 10, start = 0, queue?: number): Observable<MatchData[]> {
    const queueParam = queue ? `&queue=${queue}` : '';
    return this.http.get<MatchData[]>(
      riotUrl(`/matches/${seg(region)}/${seg(puuid)}?count=${count}&start=${start}${queueParam}`)
    );
  }

  /** Descarga un lote de partidas de la temporada a la base de datos (llamar hasta que pending = 0) */
  syncSeason(region: string, puuid: string): Observable<SyncStatus> {
    return this.http.get<SyncStatus>(riotUrl(`/sync/${seg(region)}/${seg(puuid)}`));
  }

  /** Partidas de la temporada ya guardadas (sin gastar consultas a Riot) */
  getSeasonHistory(region: string, puuid: string): Observable<SlimMatch[]> {
    return this.http.get<SlimMatch[]>(riotUrl(`/history/${seg(region)}/${seg(puuid)}`));
  }

  getChampionMastery(region: string, puuid: string, count: number = 5): Observable<ChampionMastery[]> {
    return this.http.get<ChampionMastery[]>(
      riotUrl(`/mastery/${seg(region)}/${seg(puuid)}?count=${count}`)
    );
  }

  // Obtener datos del account usando PUUID (para actualizar nombres/tags)
  getAccountByPuuid(region: string, puuid: string): Observable<{ puuid: string; gameName: string; tagLine: string }> {
    return this.http.get<{ puuid: string; gameName: string; tagLine: string }>(
      riotUrl(`/account/${seg(region)}/${seg(puuid)}`)
    );
  }
}
