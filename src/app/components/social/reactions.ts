import type { ReactionKind } from '../../models';

/**
 * Reacciones de WAYIRA. Los íconos son trazos propios (SVG, currentColor): toman el color del tema
 * que elija el Super Admin. "tone" decide qué variable del tema usa el estado activo.
 */
export interface ReactionDef { kind: ReactionKind; label: string; tone: 'accent' | 'alert' | 'text'; paths: string[] }

const FACE = 'M12 21a9 9 0 100-18 9 9 0 000 18z';

export const REACTIONS: ReactionDef[] = [
  { kind: 'like', label: 'Me gusta', tone: 'accent', paths: ['M7 11v9H4v-9h3zm0 0l4-8a2 2 0 012 2v4h5.5a2 2 0 012 2.3l-1.2 7A2 2 0 0117.3 20H7'] },
  { kind: 'love', label: 'Me encanta', tone: 'alert', paths: ['M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.2a4.3 4.3 0 017.5 2.6C19.5 15.4 12 20 12 20z'] },
  { kind: 'haha', label: 'Me divierte', tone: 'accent', paths: [FACE, 'M8 10.5l1.5-1.5 1.5 1.5M13 10.5l1.5-1.5 1.5 1.5', 'M7.8 13.5h8.4a4.2 4.2 0 01-8.4 0z'] },
  { kind: 'wow', label: 'Me sorprende', tone: 'accent', paths: [FACE, 'M9 9.5v.5M15 9.5v.5', 'M12 17.5a1.8 2.2 0 100-4.4 1.8 2.2 0 000 4.4z'] },
  { kind: 'sad', label: 'Me entristece', tone: 'text', paths: [FACE, 'M9 10v.5M15 10v.5', 'M9 16.5a3.5 3.5 0 016 0', 'M16.5 12.5c0 1-.8 1.6-.8 2.2a.8.8 0 001.6 0c0-.6-.8-1.2-.8-2.2z'] },
  { kind: 'angry', label: 'Me enfada', tone: 'alert', paths: [FACE, 'M7.5 8.5l3 1.5M16.5 8.5l-3 1.5', 'M9 16.5a3.5 3.5 0 016 0'] },
];

export const DISLIKE: ReactionDef = { kind: 'dislike', label: 'No me gusta', tone: 'text', paths: ['M17 13V4h3v9h-3zm0 0l-4 8a2 2 0 01-2-2v-4H5.5a2 2 0 01-2-2.3l1.2-7A2 2 0 016.7 4H17'] };

export const ALL_REACTIONS: ReactionDef[] = [...REACTIONS, DISLIKE];
export const reactionDef = (k: ReactionKind | null | undefined) => ALL_REACTIONS.find((r) => r.kind === k) ?? null;

/** Conteo por tipo a partir del mapa usuario → reacción */
export function countReactions(map: Record<string, ReactionKind> | undefined): Record<ReactionKind, number> {
  const out = { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0, dislike: 0 } as Record<ReactionKind, number>;
  for (const k of Object.values(map ?? {})) if (k in out) out[k]++;
  return out;
}
