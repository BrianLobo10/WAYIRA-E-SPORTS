import { Injectable } from '@angular/core';
import type { BracketMatch, Team } from '../models';

/**
 * Generador de llaves (eliminación directa y doble eliminación).
 * Es lógica pura: no guarda nada, solo arma los partidos a partir de la lista de equipos.
 * (Se separó de firebase.service.ts al retirar Firebase.)
 */
@Injectable({ providedIn: 'root' })
export class BracketGeneratorService {
  // Generate bracket structure - Genera todos los partidos desde el inicio
  generateBracket(teams: Team[], configuredRounds?: number): BracketMatch[] {
    // Shuffle teams for random bracket
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    return this.generateBracketWithOrder(shuffled, configuredRounds);
  }

  generateTournamentBrackets(
    teams: Team[],
    configuredRounds?: number,
    format: 'single' | 'double' = 'single'
  ): { bracket: BracketMatch[]; lowerBracket: BracketMatch[] } {
    if (format === 'double') {
      return this.generateDoubleEliminationBracket(teams, configuredRounds);
    }

    return {
      bracket: this.generateBracketWithOrder(teams, configuredRounds),
      lowerBracket: []
    };
  }

  // Generate bracket with specific team order
  generateBracketWithOrder(teams: Team[], configuredRounds?: number): BracketMatch[] {
    const matches: BracketMatch[] = [];
    const numTeams = teams.length;
    
    if (numTeams < 2) return matches;

    const minRounds = Math.max(1, Math.ceil(Math.log2(Math.max(2, numTeams))));
    const totalRounds = Math.max(minRounds, configuredRounds ?? minRounds);
    const bracketSize = Math.pow(2, totalRounds);
    const seededTeams: Array<Team | null> = Array.from({ length: bracketSize }, (_, index) => teams[index] ?? null);

    for (let roundNumber = 1; roundNumber <= totalRounds; roundNumber++) {
      const roundSize = Math.pow(2, totalRounds - roundNumber + 1);
      const matchCount = roundSize / 2;
      const roundType = this.getRoundTypeByParticipants(roundSize);
      const roundLabel = this.getRoundLabelByParticipants(roundSize);

      for (let slotIndex = 0; slotIndex < matchCount; slotIndex++) {
        const id = `match-${roundNumber}-${slotIndex}`;
        const nextMatchId = roundNumber < totalRounds ? `match-${roundNumber + 1}-${Math.floor(slotIndex / 2)}` : undefined;
        const nextMatchSlot = slotIndex % 2 === 0 ? 'team1' : 'team2';

        const match: BracketMatch = {
          id,
          round: roundType,
          bracketType: 'upper',
          roundIndex: roundNumber - 1,
          roundLabel,
          slotIndex,
          score1: 0,
          score2: 0,
          bestOf: 1,
          nextMatchId,
          nextMatchSlot,
          matchDate: undefined
        };

        if (roundNumber === 1) {
          const team1 = seededTeams[slotIndex * 2];
          const team2 = seededTeams[slotIndex * 2 + 1];
          match.team1Id = team1?.id;
          match.team1Name = team1?.name ?? (team2 ? 'BYE' : 'TBD');
          match.team2Id = team2?.id;
          match.team2Name = team2?.name ?? (team1 ? 'BYE' : 'TBD');
          match.autoAdvance = (!!team1 && !team2) || (!team1 && !!team2);
        } else {
          match.team1Name = 'TBD';
          match.team2Name = 'TBD';
          match.team1SourceMatchId = `match-${roundNumber - 1}-${slotIndex * 2}`;
          match.team2SourceMatchId = `match-${roundNumber - 1}-${slotIndex * 2 + 1}`;
          match.autoAdvance = false;
        }

        matches.push(match);
      }
    }

    return this.resolveBracketByes(matches);
  }

  resolveBracketByes(matches: BracketMatch[]): BracketMatch[] {
    const updated = [...matches];

    for (const match of updated) {
      const hasTeam1 = !!match.team1Id;
      const hasTeam2 = !!match.team2Id;
      if ((hasTeam1 && hasTeam2) || (!hasTeam1 && !hasTeam2)) {
        continue;
      }

      const winnerId = match.team1Id ?? match.team2Id;
      const winnerName = match.team1Id ? match.team1Name : match.team2Name;
      if (!winnerId || !winnerName) continue;

      match.winnerId = winnerId;
      match.loserId = match.team1Id ? match.team2Id : match.team1Id;
      match.autoAdvance = true;
      match.score1 = hasTeam1 && !hasTeam2 ? 1 : 0;
      match.score2 = hasTeam2 && !hasTeam1 ? 1 : 0;

      if (!match.nextMatchId || !match.nextMatchSlot) {
        continue;
      }

      const nextIndex = updated.findIndex(next => next.id === match.nextMatchId);
      if (nextIndex === -1) continue;

      const nextMatch = { ...updated[nextIndex] };
      if (match.nextMatchSlot === 'team1') {
        nextMatch.team1Id = winnerId;
        nextMatch.team1Name = winnerName;
      } else {
        nextMatch.team2Id = winnerId;
        nextMatch.team2Name = winnerName;
      }
      updated[nextIndex] = nextMatch;
    }

    return updated;
  }

  generateDoubleEliminationBracket(
    teams: Team[],
    configuredRounds?: number
  ): { bracket: BracketMatch[]; lowerBracket: BracketMatch[] } {
    const upperBracket = this.generateBracketWithOrder(teams, configuredRounds);
    if (!upperBracket.length) {
      return { bracket: [], lowerBracket: [] };
    }

    const totalRounds = Math.max(...upperBracket.map(match => (match.roundIndex ?? 0))) + 1;
    const lowerBracket: BracketMatch[] = [];

    if (totalRounds < 2) {
      return { bracket: upperBracket, lowerBracket };
    }

    for (let stage = 0; stage < totalRounds - 1; stage++) {
      const count = Math.pow(2, totalRounds - stage - 2);
      const roundAIndex = stage * 2;
      const roundBIndex = roundAIndex + 1;
      const isLastStage = stage === totalRounds - 2;
      /**
       * Antes: semifinal (lower A) → "final" (lower B) con team2 sin fuente (no venía del upper en el código).
       * Eso dejaba la final de redención con un cupo vacío y el campeón del lower no cerraba bien.
       * Un solo partido: los dos rivales vienen de la ronda anterior del lower (misma lógica que la vieja semifinal).
       */
      const mergeRedemptionFinal = isLastStage && count === 1;

      if (mergeRedemptionFinal) {
        const i = 0;
        const lowerFinalId = `lower-${roundAIndex + 1}-${i}`;
        const lowerFinalMatch: BracketMatch = {
          id: lowerFinalId,
          round: `lower-${roundAIndex + 1}`,
          bracketType: 'lower',
          roundIndex: roundBIndex,
          roundLabel: 'Final Redención',
          slotIndex: i,
          team1Name: 'TBD',
          team2Name: 'TBD',
          score1: 0,
          score2: 0,
          bestOf: 1,
          nextMatchId: undefined,
          nextMatchSlot: undefined,
          team1SourceMatchId:
            stage === 0 ? `match-1-${i * 2}` : `lower-${roundAIndex}-${i * 2}`,
          team2SourceMatchId:
            stage === 0 ? `match-1-${i * 2 + 1}` : `lower-${roundAIndex}-${i * 2 + 1}`
        };
        lowerBracket.push(lowerFinalMatch);
        continue;
      }

      for (let i = 0; i < count; i++) {
        const lowerAId = `lower-${roundAIndex + 1}-${i}`;
        const lowerAMatch: BracketMatch = {
          id: lowerAId,
          round: `lower-${roundAIndex + 1}`,
          bracketType: 'lower',
          roundIndex: roundAIndex,
          roundLabel:
            count === 1 && totalRounds === 2
              ? 'Final Redención'
              : stage === totalRounds - 2 && count === 1
                ? 'Semifinal Redención'
                : `Redención ${roundAIndex + 1}`,
          slotIndex: i,
          team1Name: 'TBD',
          team2Name: 'TBD',
          score1: 0,
          score2: 0,
          bestOf: 1,
          nextMatchId: `lower-${roundBIndex + 1}-${i}`,
          nextMatchSlot: 'team1'
        };

        if (stage === 0) {
          lowerAMatch.team1SourceMatchId = `match-1-${i * 2}`;
          lowerAMatch.team2SourceMatchId = `match-1-${i * 2 + 1}`;
        } else {
          lowerAMatch.team1SourceMatchId = `lower-${roundAIndex}-${i * 2}`;
          lowerAMatch.team2SourceMatchId = `lower-${roundAIndex}-${i * 2 + 1}`;
        }

        lowerBracket.push(lowerAMatch);
      }

      for (let i = 0; i < count; i++) {
        const lowerBId = `lower-${roundBIndex + 1}-${i}`;
        const isGrandLowerFinal = stage === totalRounds - 2;
        const lowerBMatch: BracketMatch = {
          id: lowerBId,
          round: `lower-${roundBIndex + 1}`,
          bracketType: 'lower',
          roundIndex: roundBIndex,
          roundLabel: isGrandLowerFinal ? 'Final Redención' : `Redención ${roundBIndex + 1}`,
          slotIndex: i,
          team1Name: 'TBD',
          team2Name: 'TBD',
          score1: 0,
          score2: 0,
          bestOf: 1,
          team1SourceMatchId: `lower-${roundAIndex + 1}-${i}`
        };

        if (isGrandLowerFinal) {
          // Solo alcanzable si count > 1 en última etapa (no debería ocurrir con mergeRedemptionFinal)
          lowerBMatch.nextMatchId = undefined;
          lowerBMatch.nextMatchSlot = undefined;
          lowerBMatch.team2SourceMatchId = undefined;
        } else {
          lowerBMatch.nextMatchId = `lower-${roundBIndex + 2}-${Math.floor(i / 2)}`;
          lowerBMatch.nextMatchSlot = i % 2 === 0 ? 'team1' : 'team2';
          lowerBMatch.team2SourceMatchId = `match-${stage + 2}-0`;
          if (count > 1) {
            lowerBMatch.team2SourceMatchId = `match-${stage + 2}-${i}`;
          }
        }

        lowerBracket.push(lowerBMatch);
      }
    }

    upperBracket.forEach(match => {
      const roundIndex = match.roundIndex ?? 0;
      const slotIndex = match.slotIndex ?? 0;
      if (roundIndex === totalRounds - 1) return;

      if (roundIndex === 0) {
        const targetMatch = `lower-1-${Math.floor(slotIndex / 2)}`;
        match.loserGoesToMatchId = targetMatch;
        match.loserGoesToMatchSlot = slotIndex % 2 === 0 ? 'team1' : 'team2';
        return;
      }

      const lowerTargetRound = roundIndex * 2;
      const targetMatch = `lower-${lowerTargetRound}-${slotIndex}`;
      match.loserGoesToMatchId = targetMatch;
      match.loserGoesToMatchSlot = 'team2';
    });

    const upperFinal = upperBracket.find(match => match.roundIndex === totalRounds - 1);
    if (upperFinal) {
      const oldFinalId = upperFinal.id;
      upperFinal.id = 'match-grand-final-0';
      upperFinal.roundLabel = 'Gran Final';
      // Solo ganadores del cuadro superior (semifinales); sin hueco desde redención
      upperBracket.forEach(m => {
        if (m.nextMatchId === oldFinalId) {
          m.nextMatchId = 'match-grand-final-0';
        }
      });
    }

    return {
      bracket: upperBracket,
      lowerBracket
    };
  }

  getRoundTypeByParticipants(participants: number): 'round16' | 'quarter' | 'semi' | 'final' {
    if (participants <= 2) return 'final';
    if (participants === 4) return 'semi';
    if (participants === 8) return 'quarter';
    return 'round16';
  }

  getRoundLabelByParticipants(participants: number): string {
    if (participants <= 2) return 'Final';
    if (participants === 4) return 'Semifinal';
    if (participants === 8) return 'Cuartos';
    if (participants === 16) return 'Octavos';
    return 'Ronda';
  }

  // Helper function para obtener los IDs de usuario ordenados para una conversación
}
