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

  getMatches(region: string, puuid: string, count: number = 5): Observable<MatchData[]> {
    return this.http.get<MatchData[]>(
      riotUrl(`/matches/${seg(region)}/${seg(puuid)}?count=${count}`)
    );
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

