import { Injectable } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';
import { BracketMatch, Tournament } from './firebase.service';

function isUpperMatch(m: BracketMatch): boolean {
  return (m.bracketType ?? 'upper') !== 'lower';
}

/**
 * Gran final del upper: id/etiqueta conocidos, o último partido del upper (max roundIndex, sin next).
 * El fallback por bracket cubre datos viejos o ids que no pasaron por match-grand-final-0.
 */
/** Hueco aún sin rival (esperando cuadro); no es un bye real. */
function isAwaitingOpponent(name: string | undefined, id: string | undefined): boolean {
  if (id) return false;
  if (name === 'BYE') return false;
  return true;
}

function isGrandFinalPredicate(match: BracketMatch, bracket?: BracketMatch[] | null): boolean {
  if (!isUpperMatch(match)) return false;
  if (match.id === 'match-grand-final-0' || match.roundLabel === 'Gran Final') return true;
  if (match.roundLabel === 'Final' && !match.nextMatchId) return true;
  if (bracket?.length) {
    const upper = bracket.filter(isUpperMatch);
    if (!upper.length) return false;
    const maxRi = Math.max(...upper.map(m => m.roundIndex ?? 0));
    if ((match.roundIndex ?? 0) !== maxRi) return false;
    return !match.nextMatchId;
  }
  return false;
}

/** Lógica compartida entre el modal de torneos y la vista interactiva fullscreen */
@Injectable({ providedIn: 'root' })
export class TournamentBracketEngineService {
  sanitizeBracketForFirestore(bracket: BracketMatch[]): Record<string, unknown>[] {
    return bracket.map(match => ({
      id: match.id,
      round: match.round,
      bracketType: match.bracketType ?? 'upper',
      roundIndex: match.roundIndex ?? null,
      roundLabel: match.roundLabel ?? null,
      slotIndex: match.slotIndex ?? null,
      team1Id: match.team1Id ?? null,
      team1Name: match.team1Name ?? null,
      team2Id: match.team2Id ?? null,
      team2Name: match.team2Name ?? null,
      score1: match.score1 ?? 0,
      score2: match.score2 ?? 0,
      bestOf: match.bestOf ?? 1,
      winnerId: match.winnerId ?? null,
      loserId: match.loserId ?? null,
      loserGoesToMatchId: match.loserGoesToMatchId ?? null,
      loserGoesToMatchSlot: match.loserGoesToMatchSlot ?? null,
      nextMatchId: match.nextMatchId ?? null,
      nextMatchSlot: match.nextMatchSlot ?? null,
      team1SourceMatchId: match.team1SourceMatchId ?? null,
      team2SourceMatchId: match.team2SourceMatchId ?? null,
      autoAdvance: !!match.autoAdvance,
      matchDate: match.matchDate ?? null
    }));
  }

  canAdvanceTeam(match: BracketMatch, teamId?: string): boolean {
    if (!teamId) return false;
    if (match.team1Name === 'BYE' || match.team2Name === 'BYE') return false;
    const has1 = !!match.team1Id;
    const has2 = !!match.team2Id;
    if (has1 && has2) {
      return teamId === match.team1Id || teamId === match.team2Id;
    }
    // Un solo equipo: solo válido si el otro hueco es BYE explícito (no TBD esperando rival)
    const bye1 = !match.team1Id && match.team1Name === 'BYE';
    const bye2 = !match.team2Id && match.team2Name === 'BYE';
    if (bye1 || bye2) {
      return teamId === match.team1Id || teamId === match.team2Id;
    }
    return false;
  }

  isGrandFinalMatch(match: BracketMatch, tournament?: Tournament | null): boolean {
    return isGrandFinalPredicate(match, tournament?.bracket ?? null);
  }

  /** Final del bracket de redención: etiqueta o último partido del lower (sin siguiente). */
  isLowerFinalMatch(match: BracketMatch): boolean {
    const lower =
      (match.bracketType ?? (match.id?.startsWith('lower-') ? 'lower' : 'upper')) === 'lower';
    if (!lower) return false;
    if (match.roundLabel === 'Final Redención') return true;
    return !match.nextMatchId;
  }

  private isBo3Match(tournament: Tournament, m: BracketMatch): boolean {
    if (isGrandFinalPredicate(m, tournament.bracket)) return (tournament.grandFinalBestOf ?? 3) === 3;
    if (this.isLowerFinalMatch(m)) return (tournament.redemptionFinalBestOf ?? 3) === 3;
    return false;
  }

  applyWinner(
    tournament: Tournament,
    matchId: string,
    winnerId: string
  ): { bracket: BracketMatch[]; lowerBracket: BracketMatch[] } | null {
    const currentMatch =
      tournament.bracket?.find(m => m.id === matchId) || tournament.lowerBracket?.find(m => m.id === matchId);
    if (!currentMatch || !winnerId) return null;
    if (this.isBo3Match(tournament, currentMatch)) {
      return null;
    }
    if (!this.canAdvanceTeam(currentMatch, winnerId)) return null;

    const winnerName = winnerId === currentMatch.team1Id ? currentMatch.team1Name : currentMatch.team2Name;
    const loserId = winnerId === currentMatch.team1Id ? currentMatch.team2Id : currentMatch.team1Id;
    const score1 = winnerId === currentMatch.team1Id ? 1 : 0;
    const score2 = winnerId === currentMatch.team2Id ? 1 : 0;

    return this.commitMatchResult(tournament, matchId, winnerId, loserId, score1, score2, currentMatch);
  }

  private commitMatchResult(
    tournament: Tournament,
    matchId: string,
    winnerId: string,
    loserId: string | undefined,
    score1: number,
    score2: number,
    currentMatch: BracketMatch
  ): { bracket: BracketMatch[]; lowerBracket: BracketMatch[] } | null {
    let updatedBracket = (tournament.bracket || []).map(m => ({ ...m }));
    let updatedLower = (tournament.lowerBracket || []).map(m => ({ ...m }));
    const isLower = updatedLower.some(m => m.id === matchId);

    const cleared = this.clearDependentMatches(updatedBracket, updatedLower, currentMatch.id);
    updatedBracket = cleared.bracket;
    updatedLower = cleared.lowerBracket;

    const list = isLower ? updatedLower : updatedBracket;
    const idx = list.findIndex(m => m.id === matchId);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], winnerId, loserId, score1, score2 };
    if (isLower) updatedLower = list;
    else updatedBracket = list;

    const winnerName = winnerId === list[idx].team1Id ? list[idx].team1Name : list[idx].team2Name;

    const propagated = this.propagateWinner(
      updatedBracket,
      updatedLower,
      currentMatch,
      winnerId,
      winnerName ?? 'TBD',
      loserId
    );
    return { bracket: propagated.bracket, lowerBracket: propagated.lowerBracket };
  }

  /**
   * +1 mapa al ganador (gran final y final de redención en Bo3).
   * Alias retrocompatible:
   */
  applyGrandFinalMapWin(
    tournament: Tournament,
    matchId: string,
    mapWinnerId: string
  ): { bracket: BracketMatch[]; lowerBracket: BracketMatch[] } | null {
    return this.applyBo3MapWin(tournament, matchId, mapWinnerId);
  }

  applyBo3MapWin(
    tournament: Tournament,
    matchId: string,
    mapWinnerId: string
  ): { bracket: BracketMatch[]; lowerBracket: BracketMatch[] } | null {
    const m =
      tournament.bracket?.find(x => x.id === matchId) || tournament.lowerBracket?.find(x => x.id === matchId);
    if (!m) return null;
    if (!this.isBo3Match(tournament, m)) {
      return this.applyWinner(tournament, matchId, mapWinnerId);
    }
    if (!this.canAdvanceTeam(m, mapWinnerId)) return null;

    const is1 = mapWinnerId === m.team1Id;
    const newS1 = (m.score1 ?? 0) + (is1 ? 1 : 0);
    const newS2 = (m.score2 ?? 0) + (!is1 ? 1 : 0);
    const need = 2;

    let updatedBracket = (tournament.bracket || []).map(x => ({ ...x }));
    let updatedLower = (tournament.lowerBracket || []).map(x => ({ ...x }));
    const list = updatedLower.some(x => x.id === matchId) ? updatedLower : updatedBracket;
    const idx = list.findIndex(x => x.id === matchId);
    if (idx === -1) return null;

    if (newS1 >= need || newS2 >= need) {
      const winnerId = newS1 >= need ? m.team1Id! : m.team2Id!;
      const loserId = newS1 >= need ? m.team2Id : m.team1Id;
      if (updatedLower.some(x => x.id === matchId)) updatedLower = list;
      else updatedBracket = list;
      const t2: Tournament = {
        ...tournament,
        bracket: updatedBracket,
        lowerBracket: updatedLower
      };
      return this.commitMatchResult(t2, matchId, winnerId, loserId, newS1, newS2, m);
    }

    list[idx] = {
      ...list[idx],
      score1: newS1,
      score2: newS2,
      winnerId: undefined,
      loserId: undefined
    };
    if (updatedLower.some(x => x.id === matchId)) updatedLower = list;
    else updatedBracket = list;
    return { bracket: updatedBracket, lowerBracket: updatedLower };
  }

  swapTeamsInMatch(
    bracket: BracketMatch[],
    lowerBracket: BracketMatch[],
    matchId: string
  ): { bracket: BracketMatch[]; lowerBracket: BracketMatch[] } | null {
    const inU = bracket.findIndex(m => m.id === matchId);
    const inL = lowerBracket.findIndex(m => m.id === matchId);
    if (inU === -1 && inL === -1) return null;
    const copyU = bracket.map(m => ({ ...m }));
    const copyL = lowerBracket.map(m => ({ ...m }));
    const m =
      inU !== -1
        ? copyU[inU]
        : copyL[inL];
    const t1 = m.team1Id;
    const n1 = m.team1Name;
    const t2 = m.team2Id;
    const n2 = m.team2Name;
    const updated = {
      ...m,
      team1Id: t2,
      team1Name: n2,
      team2Id: t1,
      team2Name: n1,
      winnerId: undefined,
      loserId: undefined,
      score1: 0,
      score2: 0
    };
    if (inU !== -1) copyU[inU] = updated;
    else copyL[inL] = updated;
    return { bracket: copyU, lowerBracket: copyL };
  }

  private clearDependentMatches(
    bracket: BracketMatch[],
    lowerBracket: BracketMatch[],
    sourceMatchId: string
  ): { bracket: BracketMatch[]; lowerBracket: BracketMatch[] } {
    let updatedUpper = bracket.map(m => ({ ...m }));
    let updatedLower = lowerBracket.map(m => ({ ...m }));
    const combined = [...updatedUpper, ...updatedLower];
    const dependents = combined.filter(
      m => m.team1SourceMatchId === sourceMatchId || m.team2SourceMatchId === sourceMatchId
    );

    for (const dependent of dependents) {
      const collection = updatedUpper.some(m => m.id === dependent.id) ? updatedUpper : updatedLower;
      const index = collection.findIndex(m => m.id === dependent.id);
      if (index === -1) continue;
      const cleared = { ...collection[index], winnerId: undefined, loserId: undefined, score1: 0, score2: 0 };
      if (cleared.team1SourceMatchId === sourceMatchId) {
        cleared.team1Id = undefined;
        cleared.team1Name = 'TBD';
      }
      if (cleared.team2SourceMatchId === sourceMatchId) {
        cleared.team2Id = undefined;
        cleared.team2Name = 'TBD';
      }
      collection[index] = cleared;
      const next = this.clearDependentMatches(updatedUpper, updatedLower, cleared.id);
      updatedUpper = next.bracket;
      updatedLower = next.lowerBracket;
    }

    return { bracket: updatedUpper, lowerBracket: updatedLower };
  }

  private propagateWinner(
    bracket: BracketMatch[],
    lowerBracket: BracketMatch[],
    currentMatch: BracketMatch,
    winnerId: string,
    winnerName: string,
    loserId?: string
  ): { bracket: BracketMatch[]; lowerBracket: BracketMatch[] } {
    let updatedUpper = [...bracket];
    let updatedLower = [...lowerBracket];

    if (loserId && currentMatch.loserGoesToMatchId && currentMatch.loserGoesToMatchSlot) {
      const loserName = loserId === currentMatch.team1Id ? currentMatch.team1Name : currentMatch.team2Name;
      const loserTargetIndex = updatedLower.findIndex(m => m.id === currentMatch.loserGoesToMatchId);
      if (loserTargetIndex !== -1) {
        const loserTarget = { ...updatedLower[loserTargetIndex] };
        if (currentMatch.loserGoesToMatchSlot === 'team1') {
          loserTarget.team1Id = loserId;
          loserTarget.team1Name = loserName ?? 'TBD';
        } else {
          loserTarget.team2Id = loserId;
          loserTarget.team2Name = loserName ?? 'TBD';
        }
        updatedLower[loserTargetIndex] = loserTarget;
      }
    }

    if (!currentMatch?.nextMatchId || !currentMatch.nextMatchSlot) {
      return { bracket: updatedUpper, lowerBracket: updatedLower };
    }

    const upperNextIndex = updatedUpper.findIndex(m => m.id === currentMatch.nextMatchId);
    const lowerNextIndex = updatedLower.findIndex(m => m.id === currentMatch.nextMatchId);
    const nextIsUpper = upperNextIndex !== -1;
    const nextIndex = nextIsUpper ? upperNextIndex : lowerNextIndex;
    if (nextIndex === -1) return { bracket: updatedUpper, lowerBracket: updatedLower };

    const targetCollection = nextIsUpper ? updatedUpper : updatedLower;
    const nextMatch = { ...targetCollection[nextIndex] };

    if (currentMatch.nextMatchSlot === 'team1') {
      nextMatch.team1Id = winnerId;
      nextMatch.team1Name = winnerName;
    } else {
      nextMatch.team2Id = winnerId;
      nextMatch.team2Name = winnerName;
    }

    nextMatch.winnerId = undefined;
    nextMatch.loserId = undefined;
    const bo3FinalNext =
      isGrandFinalPredicate(nextMatch, updatedUpper) || this.isLowerFinalMatch(nextMatch);
    if (!bo3FinalNext || ((nextMatch.score1 ?? 0) === 0 && (nextMatch.score2 ?? 0) === 0)) {
      nextMatch.score1 = 0;
      nextMatch.score2 = 0;
    }
    targetCollection[nextIndex] = nextMatch;

    const hasTeam1 = !!nextMatch.team1Id;
    const hasTeam2 = !!nextMatch.team2Id;
    if (hasTeam1 !== hasTeam2) {
      // Antes: cualquier hueco vacío disparaba "ganador" y encadenaba propagación (semifinal → final
      // con un solo equipo). Solo tiene sentido con BYE; si el hueco es TBD, falta el rival.
      const waiting1 = isAwaitingOpponent(nextMatch.team1Name, nextMatch.team1Id);
      const waiting2 = isAwaitingOpponent(nextMatch.team2Name, nextMatch.team2Id);
      if (waiting1 || waiting2) {
        targetCollection[nextIndex] = nextMatch;
        return { bracket: updatedUpper, lowerBracket: updatedLower };
      }
      const autoWinnerId = nextMatch.team1Id ?? nextMatch.team2Id;
      const autoWinnerName = nextMatch.team1Id ? nextMatch.team1Name : nextMatch.team2Name;
      if (autoWinnerId && autoWinnerName) {
        nextMatch.winnerId = autoWinnerId;
        nextMatch.score1 = nextMatch.team1Id ? 1 : 0;
        nextMatch.score2 = nextMatch.team2Id ? 1 : 0;
        targetCollection[nextIndex] = nextMatch;
        return this.propagateWinner(updatedUpper, updatedLower, nextMatch, autoWinnerId, autoWinnerName, undefined);
      }
    }

    return { bracket: updatedUpper, lowerBracket: updatedLower };
  }

  /**
   * Cuando gran final (y en doble elim. la final de redención) tienen ganador, el torneo pasa a finished.
   */
  finalizeTournamentIfComplete(t: Tournament): Tournament {
    if (t.status === 'finished') return t;
    const gf = t.bracket?.find(m => isGrandFinalPredicate(m, t.bracket));
    if (!gf?.winnerId) return t;
    if (t.format === 'double' && (t.lowerBracket?.length ?? 0) > 0) {
      const lf = t.lowerBracket?.find(m => this.isLowerFinalMatch(m));
      if (!lf?.winnerId) return t;
    }
    const gName =
      gf.winnerId === gf.team1Id ? gf.team1Name ?? '—' : gf.team2Name ?? '—';
    let redemptionId: string | undefined;
    let redemptionName: string | undefined;
    if (t.format === 'double') {
      const lf = t.lowerBracket?.find(m => this.isLowerFinalMatch(m));
      if (lf?.winnerId) {
        redemptionId = lf.winnerId;
        redemptionName = lf.winnerId === lf.team1Id ? lf.team1Name ?? '—' : lf.team2Name ?? '—';
      }
    }
    return {
      ...t,
      status: 'finished',
      finishedAt: Timestamp.now(),
      championTeamId: gf.winnerId,
      championTeamName: gName,
      redemptionChampionTeamId: redemptionId,
      redemptionChampionTeamName: redemptionName
    };
  }
}
