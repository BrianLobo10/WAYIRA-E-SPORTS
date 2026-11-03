import { Injectable, inject } from '@angular/core';
import { Timestamp } from '../utils/timestamp';
import { Observable, from, map } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { CommunityService } from './community.service';
import { BracketGeneratorService } from './bracket-generator.service';
import {
  type BracketMatch,
  type PlayerInfo,
  type Team,
  type TeamTournamentStats,
  type Tournament,
} from '../models';

/**
 * Torneos sobre Supabase.
 * Devuelve el mismo modelo `Tournament` que usaba Firebase (equipos dentro del torneo, llaves en JSON)
 * para que las páginas existentes sigan funcionando, y añade lo nuevo: estado de cada inscripción,
 * aprobación, lista de espera y check-in. Las reglas (cupos, Riot ID, permisos) las aplica la base de datos.
 */

export type TeamStatus = 'pending' | 'approved' | 'rejected' | 'waitlisted' | 'withdrawn';

/** Inscripción de un equipo con su estado (lo ven el organizador y el capitán). */
export interface TeamRegistration extends Team {
  status: TeamStatus;
  checkedInAt: Date | null;
}

export type SbTournament = Tournament & {
  /** Todas las inscripciones, en cualquier estado. `teams` solo trae las aprobadas. */
  registrations: TeamRegistration[];
  checkInMinutes: number;
};

/** Jugador tal como lo pide la inscripción (sin teléfono ni correo). */
export interface RegistrationPlayer {
  name: string;
  gameName: string;
  tagLine: string;
  role?: string;
  mainChampion?: string;
  userId?: string;
  isSubstitute?: boolean;
}

interface PlayerRow {
  id: string;
  user_id: string | null;
  display_name: string;
  game_name: string | null;
  tag_line: string | null;
  position: string | null;
  main_champion: string | null;
  is_substitute: boolean;
  sort_order: number;
}

interface TeamRow {
  id: string;
  name: string;
  logo_url: string | null;
  captain_id: string | null;
  captain_name: string | null;
  registered_at: string;
  status: TeamStatus;
  checked_in_at: string | null;
  tournament_players: PlayerRow[];
}

interface TournamentRow {
  id: string;
  name: string;
  description: string;
  game: string;
  start_date: string | null;
  end_date: string | null;
  max_teams: number;
  status: Tournament['status'];
  format: 'single' | 'double' | null;
  configured_rounds: number | null;
  bracket: BracketMatch[];
  lower_bracket: BracketMatch[];
  confirmed: boolean;
  confirmed_at: string | null;
  prize_pool_usd: number | null;
  grand_final_best_of: 1 | 3 | null;
  redemption_final_best_of: 1 | 3 | null;
  finished_at: string | null;
  champion_team_id: string | null;
  champion_team_name: string | null;
  redemption_champion_team_id: string | null;
  redemption_champion_team_name: string | null;
  created_by: string | null;
  created_at: string;
  check_in_minutes: number;
  tournament_teams: TeamRow[];
}

const SELECT = `*, tournament_teams(id, name, logo_url, captain_id, captain_name, registered_at, status, checked_in_at,
  tournament_players(id, user_id, display_name, game_name, tag_line, position, main_champion, is_substitute, sort_order))`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

const toTs = (iso: string | null | undefined) => (iso ? Timestamp.fromDate(new Date(iso)) : undefined);
const toIso = (v: unknown): string | null => {
  if (v == null) return null;
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof v === 'string' ? v : null;
};

/** Quita `undefined` (JSON no lo admite) y convierte fechas de los partidos a texto ISO. */
const cleanBracket = (list: BracketMatch[] | undefined): unknown[] =>
  JSON.parse(JSON.stringify(list ?? [], (_k, v) => (v instanceof Timestamp ? v.toDate().toISOString() : v)));

/** Las fechas de los partidos vuelven como objetos con toDate(), como en Firebase. */
const reviveBracket = (list: BracketMatch[] | null | undefined): BracketMatch[] =>
  (list ?? []).map((m) => (typeof m.matchDate === 'string' ? { ...m, matchDate: Timestamp.fromDate(new Date(m.matchDate)) } : m));

@Injectable({ providedIn: 'root' })
export class TournamentService {
  private readonly sb = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  private readonly community = inject(CommunityService);
  /** Arma las llaves (lógica pura). */
  private readonly legacy = inject(BracketGeneratorService);

  // ---------------------------------------------------------------------------
  // Sesión y permisos
  // ---------------------------------------------------------------------------

  getCurrentUser() {
    return this.community.getCurrentUser();
  }

  getUserProfile(uid: string) {
    return this.community.getUserProfile(uid);
  }

  /** Puede crear y gestionar torneos (rol Organizador o superior). */
  async isAdmin(_uid?: string): Promise<boolean> {
    await this.auth.waitForInit();
    return this.auth.hasPermission('tournaments.manage');
  }

  // ---------------------------------------------------------------------------
  // Lectura
  // ---------------------------------------------------------------------------

  getTournaments(): Observable<SbTournament[]> {
    return from(this.query((q) => q.order('created_at', { ascending: false })));
  }

  getTournamentById(id: string): Observable<SbTournament | null> {
    if (!isUuid(id)) return from(Promise.resolve(null));
    return from(this.query((q) => q.eq('id', id))).pipe(map((list) => list[0] ?? null));
  }

  getFinishedTournaments(): Observable<SbTournament[]> {
    return from(
      this.query((q) => q.eq('status', 'finished').order('finished_at', { ascending: false, nullsFirst: false }).limit(100)),
    );
  }

  /** Torneo en curso más reciente (para el aviso de la cabecera). */
  getActiveTournament(): Observable<SbTournament | null> {
    return from(
      this.query((q) => q.eq('status', 'ongoing').order('created_at', { ascending: false }).limit(1)),
    ).pipe(map((list) => list[0] ?? null));
  }

  getAvailableTournaments(): Observable<SbTournament[]> {
    return from(
      this.query((q) => q.in('status', ['upcoming', 'ongoing', 'confirmed']).order('created_at', { ascending: false }).limit(50)),
    );
  }

  hasAvailableTournaments(): Observable<boolean> {
    return from(
      this.sb
        .from('tournaments')
        .select('id', { count: 'exact', head: true })
        .in('status', ['upcoming', 'ongoing', 'confirmed'])
        .then(({ count }) => (count ?? 0) > 0),
    );
  }

  getTeamTournamentStats(teamId: string): Observable<TeamTournamentStats | null> {
    return from(
      this.sb
        .from('team_tournament_stats')
        .select('team_key, team_name, tournaments_won, updated_at')
        .eq('team_key', teamId)
        .maybeSingle()
        .then(({ data }) =>
          data
            ? {
                teamId: data.team_key as string,
                teamName: data.team_name as string,
                tournamentsWon: data.tournaments_won as number,
                updatedAt: toTs(data.updated_at as string)!,
              }
            : null,
        ),
    );
  }

  // ---------------------------------------------------------------------------
  // Gestión (requiere permiso tournaments.manage; lo comprueba la base de datos)
  // ---------------------------------------------------------------------------

  async createTournament(t: Partial<Tournament> & { name: string }): Promise<string> {
    const { data, error } = await this.sb
      .from('tournaments')
      .insert({
        ...this.toRow(t),
        status: 'upcoming',
        created_by: this.auth.user()?.id ?? null,
        grand_final_best_of: t.grandFinalBestOf ?? 3,
        redemption_final_best_of: t.redemptionFinalBestOf ?? 3,
      })
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  /**
   * Actualiza un torneo. Si el cambio trae `teams` (torneo de prueba, importación desde Excel o confirmación
   * de llaves), se sincronizan los equipos: los que ya no están se borran y los nuevos se crean aprobados.
   */
  async updateTournament(id: string, patch: Partial<Tournament> & Record<string, unknown>): Promise<void> {
    if (patch.teams) await this.syncTeams(id, patch.teams);
    const row = this.toRow(patch);
    if (!Object.keys(row).length) return;
    const { error } = await this.sb.from('tournaments').update(row).eq('id', id);
    if (error) throw error;
  }

  async deleteTournament(id: string): Promise<void> {
    const { error } = await this.sb.from('tournaments').delete().eq('id', id);
    if (error) throw error;
  }

  /** Aprobar, rechazar o devolver a pendiente una inscripción. */
  async setTeamStatus(teamId: string, status: TeamStatus): Promise<void> {
    const { error } = await this.sb.from('tournament_teams').update({ status }).eq('id', teamId);
    if (error) throw new Error(friendly(error));
  }

  /** Los equipos aprobados que no hicieron check-in pierden el cupo. Devuelve cuántos. */
  async closeCheckIn(tournamentId: string): Promise<number> {
    const { data, error } = await this.sb.rpc('close_check_in', { p_tournament: tournamentId });
    if (error) throw new Error(friendly(error));
    return (data as number) ?? 0;
  }

  /** Suma un torneo ganado al historial del equipo campeón. */
  async incrementTeamTournamentWins(teamId: string, teamName: string): Promise<void> {
    const { data } = await this.sb.from('team_tournament_stats').select('tournaments_won').eq('team_key', teamId).maybeSingle();
    const won = ((data as { tournaments_won: number } | null)?.tournaments_won ?? 0) + 1;
    const { error } = data
      ? await this.sb.from('team_tournament_stats').update({ tournaments_won: won, team_name: teamName, updated_at: new Date().toISOString() }).eq('team_key', teamId)
      : await this.sb.from('team_tournament_stats').insert({ team_key: teamId, team_name: teamName, tournaments_won: 1 });
    if (error) throw error;
  }

  /** Resta un torneo ganado (cuando se deshace el cierre de un torneo). */
  async decrementTeamTournamentWins(teamId: string): Promise<void> {
    const { data } = await this.sb.from('team_tournament_stats').select('tournaments_won').eq('team_key', teamId).maybeSingle();
    const won = (data as { tournaments_won: number } | null)?.tournaments_won ?? 0;
    if (won <= 0) return;
    const { error } = await this.sb
      .from('team_tournament_stats')
      .update({ tournaments_won: won - 1, updated_at: new Date().toISOString() })
      .eq('team_key', teamId);
    if (error) throw error;
  }

  // ---------------------------------------------------------------------------
  // Capitanes
  // ---------------------------------------------------------------------------

  /**
   * Inscribe un equipo. Queda "pendiente" hasta que un organizador lo apruebe,
   * o "en lista de espera" si ya no hay cupos. Devuelve el estado asignado.
   */
  async registerTeam(
    tournamentId: string,
    teamName: string,
    logoUrl: string | null,
    players: RegistrationPlayer[],
  ): Promise<TeamStatus> {
    const { data, error } = await this.sb.rpc('register_team', {
      p_tournament: tournamentId,
      p_name: teamName.trim(),
      p_logo_url: logoUrl,
      p_players: players.map((p) => ({
        display_name: p.name.trim(),
        game_name: p.gameName.trim(),
        tag_line: p.tagLine.trim().replace(/^#/, ''),
        position: p.role ?? null,
        main_champion: p.mainChampion ?? null,
        is_substitute: !!p.isSubstitute,
        user_id: p.userId ?? null,
      })),
    });
    if (error) throw new Error(friendly(error));
    const { data: team } = await this.sb.from('tournament_teams').select('status').eq('id', data as string).single();
    return ((team as { status: TeamStatus } | null)?.status ?? 'pending');
  }

  async withdrawTeam(teamId: string): Promise<void> {
    const { error } = await this.sb.rpc('withdraw_team', { p_team: teamId });
    if (error) throw new Error(friendly(error));
  }

  async checkInTeam(teamId: string): Promise<void> {
    const { error } = await this.sb.rpc('check_in_team', { p_team: teamId });
    if (error) throw new Error(friendly(error));
  }

  /** Sube el logo del equipo (recomprimido) a la carpeta del usuario. */
  async uploadTeamLogo(_legacyPath: string, file: File): Promise<string> {
    return this.community.uploadImage(file, 'team-logos');
  }

  // ---------------------------------------------------------------------------
  // Llaves (funciones puras heredadas; no usan Firebase)
  // ---------------------------------------------------------------------------

  generateBracket(teams: Team[], configuredRounds?: number): BracketMatch[] {
    return this.legacy.generateBracket(teams, configuredRounds);
  }

  generateTournamentBrackets(teams: Team[], configuredRounds?: number, format: 'single' | 'double' = 'single') {
    return this.legacy.generateTournamentBrackets(teams, configuredRounds, format);
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  private async query(filter: (q: any) => any): Promise<SbTournament[]> {
    const { data, error } = await filter(this.sb.from('tournaments').select(SELECT));
    if (error) throw error;
    return ((data ?? []) as TournamentRow[]).map((row) => this.toTournament(row));
  }

  private toTournament(row: TournamentRow): SbTournament {
    const registrations = [...(row.tournament_teams ?? [])]
      .sort((a, b) => a.registered_at.localeCompare(b.registered_at))
      .map((t) => this.toTeam(t));
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      game: row.game,
      startDate: toTs(row.start_date)!,
      endDate: toTs(row.end_date)!,
      maxTeams: row.max_teams,
      teams: registrations.filter((t) => t.status === 'approved'),
      registrations,
      status: row.status,
      format: row.format ?? undefined,
      configuredRounds: row.configured_rounds ?? undefined,
      createdBy: row.created_by ?? '',
      createdAt: toTs(row.created_at)!,
      // Sin llaves = undefined, como en Firebase (la página comprueba `tournament.bracket`)
      bracket: row.bracket?.length ? reviveBracket(row.bracket) : undefined,
      lowerBracket: reviveBracket(row.lower_bracket),
      confirmed: row.confirmed,
      confirmedAt: toTs(row.confirmed_at),
      prizePoolUsd: row.prize_pool_usd ?? undefined,
      grandFinalBestOf: row.grand_final_best_of ?? undefined,
      redemptionFinalBestOf: row.redemption_final_best_of ?? undefined,
      finishedAt: toTs(row.finished_at),
      championTeamId: row.champion_team_id ?? undefined,
      championTeamName: row.champion_team_name ?? undefined,
      redemptionChampionTeamId: row.redemption_champion_team_id ?? undefined,
      redemptionChampionTeamName: row.redemption_champion_team_name ?? undefined,
      checkInMinutes: row.check_in_minutes,
    };
  }

  private toTeam(t: TeamRow): TeamRegistration {
    const players = [...(t.tournament_players ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const info: PlayerInfo[] = players.map((p) => ({
      userId: p.user_id ?? undefined,
      name: p.display_name,
      phone: '',
      email: '',
      gameName: p.game_name ?? '',
      tagLine: p.tag_line ?? '',
      role: p.position ?? undefined,
      mainChampion: p.main_champion ?? undefined,
    }));
    return {
      id: t.id,
      name: t.name,
      logo: t.logo_url ?? undefined,
      logoUrl: t.logo_url ?? undefined,
      captainId: t.captain_id ?? '',
      captainName: t.captain_name ?? '',
      players: players.filter((p) => !p.is_substitute).map((p) => p.user_id ?? p.id),
      playerInfo: info,
      substitutes: players.filter((p) => p.is_substitute).map((p) => p.user_id ?? p.id),
      registeredAt: toTs(t.registered_at)!,
      status: t.status,
      checkedInAt: t.checked_in_at ? new Date(t.checked_in_at) : null,
    };
  }

  /** Traduce el modelo antiguo a columnas. Solo incluye lo que viene en el cambio. */
  private toRow(t: Partial<Tournament> & Record<string, unknown>): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    const set = (key: string, column: string, convert: (v: unknown) => unknown = (v) => v ?? null) => {
      if (key in t) row[column] = convert(t[key]);
    };
    set('name', 'name');
    set('description', 'description', (v) => v ?? '');
    set('game', 'game');
    set('startDate', 'start_date', toIso);
    set('endDate', 'end_date', toIso);
    set('maxTeams', 'max_teams');
    set('status', 'status');
    set('format', 'format');
    set('configuredRounds', 'configured_rounds');
    set('bracket', 'bracket', (v) => cleanBracket(v as BracketMatch[]));
    set('lowerBracket', 'lower_bracket', (v) => cleanBracket(v as BracketMatch[]));
    set('confirmed', 'confirmed', (v) => !!v);
    set('confirmedAt', 'confirmed_at', toIso);
    set('prizePoolUsd', 'prize_pool_usd');
    set('grandFinalBestOf', 'grand_final_best_of');
    set('redemptionFinalBestOf', 'redemption_final_best_of');
    set('finishedAt', 'finished_at', toIso);
    set('championTeamId', 'champion_team_id', (v) => (isUuid(v) ? v : null));
    set('championTeamName', 'champion_team_name');
    set('redemptionChampionTeamId', 'redemption_champion_team_id', (v) => (isUuid(v) ? v : null));
    set('redemptionChampionTeamName', 'redemption_champion_team_name');
    set('checkInMinutes', 'check_in_minutes');
    return row;
  }

  /** Deja en el torneo exactamente los equipos de la lista (para torneos de prueba, importaciones y llaves). */
  private async syncTeams(tournamentId: string, teams: Team[]): Promise<void> {
    const { data: existing, error } = await this.sb
      .from('tournament_teams')
      .select('id, status')
      .eq('tournament_id', tournamentId);
    if (error) throw error;
    const rows = (existing ?? []) as { id: string; status: TeamStatus }[];
    const wanted = new Set(teams.map((t) => t.id));

    // Fuera los equipos aprobados que ya no están en la lista (pendientes, rechazados y retirados no se tocan)
    const remove = rows.filter((r) => !wanted.has(r.id) && r.status === 'approved').map((r) => r.id);
    if (remove.length) {
      const { error: delError } = await this.sb.from('tournament_teams').delete().in('id', remove);
      if (delError) throw delError;
    }

    const known = new Set(rows.map((r) => r.id));
    const uid = this.auth.user()?.id;
    for (const team of teams.filter((t) => !known.has(t.id))) {
      const id = isUuid(team.id) ? team.id : crypto.randomUUID();
      const { error: insError } = await this.sb.from('tournament_teams').insert({
        id,
        tournament_id: tournamentId,
        name: team.name.slice(0, 40),
        logo_url: team.logoUrl || team.logo || null,
        captain_id: team.captainId === uid ? uid : null,
        captain_name: team.captainName || null,
        status: 'approved',
      });
      if (insError) throw insError;
      const players = (team.playerInfo ?? []).map((p, i) => {
        const validRiot = (p.gameName ?? '').trim().length >= 3 && (p.gameName ?? '').trim().length <= 16 && /^[A-Za-z0-9]{3,5}$/.test((p.tagLine ?? '').trim());
        return {
          team_id: id,
          display_name: (p.name || p.gameName || `Jugador ${i + 1}`).slice(0, 60),
          game_name: validRiot ? p.gameName.trim() : null,
          tag_line: validRiot ? p.tagLine.trim() : null,
          position: p.role ?? null,
          main_champion: p.mainChampion ?? null,
          sort_order: i,
        };
      });
      if (players.length) {
        const { error: plError } = await this.sb.from('tournament_players').insert(players);
        if (plError) throw plError;
      }
    }
  }
}

/** Mensajes de la base de datos ya vienen en español; los técnicos se cambian por uno genérico. */
function friendly(error: { message?: string; code?: string }): string {
  const msg = error.message ?? '';
  if (/^[A-ZÁÉÍÓÚÑ¿¡]/.test(msg) && !/violates|permission|syntax|column|relation|function/i.test(msg)) return msg;
  if (error.code === '42501') return 'No tienes permiso para hacer esto.';
  return 'No se pudo completar la acción. Intenta de nuevo.';
}
