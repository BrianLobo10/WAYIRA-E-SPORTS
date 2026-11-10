import { SlimMatch, SlimParticipant } from '../../services/riot-api.service';

/** Cálculos del dashboard. Todo sale de partidas reales de Riot: nada de puntuaciones propias ni datos estimados. */

export interface ModeFilter { key: string; label: string; queues: number[] | null }
export const MODE_FILTERS: ModeFilter[] = [
  { key: 'ranked', label: 'Ranked', queues: [420, 440] },
  { key: 'solo', label: 'Solo/Duo', queues: [420] },
  { key: 'flex', label: 'Flex', queues: [440] },
  { key: 'normal', label: 'Normal', queues: [400, 430, 480, 490] },
  { key: 'aram', label: 'ARAM', queues: [450, 720] },
  { key: 'arena', label: 'Arena', queues: [1700, 1710, 1740, 1750] },
  { key: 'all', label: 'Todas', queues: null },
];

export interface Game { m: SlimMatch; me: SlimParticipant; start: number; end: number; win: boolean }
export interface Rate { wins: number; games: number; rate: number | null }
export interface Bar { label: string; rate: number | null; games: number }
export interface Point { label: string; value: number }
export interface RecordRow { label: string; value: string; champ: string; champId: number; date: number; matchId: string }

export interface SeasonStats {
  games: number; wins: number; winRate: number;
  timePlayed: string; gamesPerSession: number; sessions: number;
  blue: Rate; red: Rate;
  afterWin: Rate; afterLoss: Rate; hotStreak: Rate; coldStreak: Rate;
  byDay: Bar[]; byHour: Bar[]; byDuration: Bar[];
  sessionWinRate: Point[]; sessionGold: Point[]; sessionKp: Point[]; sessionVision: Point[];
  records: RecordRow[];
  /** Mapa semanal: 7 días × 24 horas (hora de Colombia) */
  heat: { games: number; wins: number }[][];
  insights: string[];
}

const TZ = 'America/Bogota';
const SESSION_GAP_MS = 60 * 60_000; // más de 1 h sin jugar = sesión nueva
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function findMe(m: SlimMatch, puuid: string, name?: string, tag?: string): SlimParticipant | undefined {
  // El PUUID depende de la clave de Riot: si no coincide se busca por Riot ID
  return m.participants.find((p) => p.puuid === puuid)
    ?? (name ? m.participants.find((p) => p.name?.toLowerCase() === name.toLowerCase() && (!tag || p.tag?.toLowerCase() === tag.toLowerCase())) : undefined);
}

export function toGames(matches: SlimMatch[], puuid: string, name?: string, tag?: string): Game[] {
  const games: Game[] = [];
  for (const m of matches) {
    const me = findMe(m, puuid, name, tag);
    if (!me || !m.created) continue;
    // Las partidas que terminan en remake (< 5 min) no cuentan
    if ((m.duration ?? 0) < 300) continue;
    games.push({ m, me, start: m.created, end: m.created + (m.duration ?? 0) * 1000, win: me.win });
  }
  return games.sort((a, b) => a.start - b.start);
}

export function filterGames(games: Game[], filter: ModeFilter): Game[] {
  return filter.queues ? games.filter((g) => filter.queues!.includes(g.m.queue)) : games;
}

function rate(list: Game[]): Rate {
  const wins = list.filter((g) => g.win).length;
  return { wins, games: list.length, rate: list.length ? Math.round((wins / list.length) * 1000) / 10 : null };
}

function localParts(ts: number): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(ts));
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  return { day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(wd), hour };
}

function formatDuration(totalSeconds: number): string {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return [d ? `${d}d` : '', d || h ? `${h}h` : '', `${m}m`].filter(Boolean).join(' ');
}

function sessionsOf(games: Game[]): Game[][] {
  const out: Game[][] = [];
  for (const g of games) {
    const last = out[out.length - 1];
    if (last && g.start - last[last.length - 1].end <= SESSION_GAP_MS) last.push(g); else out.push([g]);
  }
  return out;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const fmt = (n: number) => n.toLocaleString('es-CO');

export function computeStats(games: Game[]): SeasonStats {
  const r = rate(games);
  const sessions = sessionsOf(games);

  // Antes de cada partida: ¿qué pasó en la anterior / en las dos anteriores?
  const afterWin: Game[] = [], afterLoss: Game[] = [], hot: Game[] = [], cold: Game[] = [];
  games.forEach((g, i) => {
    if (i >= 1) (games[i - 1].win ? afterWin : afterLoss).push(g);
    if (i >= 2 && games[i - 1].win && games[i - 2].win) hot.push(g);
    if (i >= 2 && !games[i - 1].win && !games[i - 2].win) cold.push(g);
  });

  const byDayLists: Game[][] = DAYS.map(() => []);
  const byHourLists: Game[][] = Array.from({ length: 24 }, () => []);
  const heat = DAYS.map(() => Array.from({ length: 24 }, () => ({ games: 0, wins: 0 })));
  for (const g of games) {
    const { day, hour } = localParts(g.start);
    byDayLists[day]?.push(g);
    byHourLists[hour].push(g);
    if (heat[day]) { heat[day][hour].games++; if (g.win) heat[day][hour].wins++; }
  }
  const buckets = [
    { label: '< 20', min: 0, max: 20 }, { label: '20-25', min: 20, max: 25 }, { label: '25-30', min: 25, max: 30 },
    { label: '30-35', min: 30, max: 35 }, { label: '35-40', min: 35, max: 40 }, { label: '40+', min: 40, max: 999 },
  ];
  const toBar = (label: string, list: Game[]): Bar => { const x = rate(list); return { label, rate: x.rate, games: x.games }; };

  // Tendencia por sesión: últimas 10 sesiones
  const recent = sessions.slice(-10);
  const sessionLabel = (s: Game[]) => new Intl.DateTimeFormat('es-CO', { timeZone: TZ, day: 'numeric', month: 'short' }).format(new Date(s[0].start));
  const perSession = (fn: (g: Game) => number, digits = 1): Point[] => recent.map((s) => ({ label: sessionLabel(s), value: round(avg(s.map(fn)), digits) }));

  const result: SeasonStats = {
    games: r.games,
    wins: r.wins,
    winRate: r.rate ?? 0,
    timePlayed: formatDuration(games.reduce((s, g) => s + (g.m.duration ?? 0), 0)),
    gamesPerSession: sessions.length ? round(games.length / sessions.length) : 0,
    sessions: sessions.length,
    blue: rate(games.filter((g) => g.me.team === 100)),
    red: rate(games.filter((g) => g.me.team === 200)),
    afterWin: rate(afterWin), afterLoss: rate(afterLoss), hotStreak: rate(hot), coldStreak: rate(cold),
    byDay: DAYS.map((d, i) => toBar(d, byDayLists[i])),
    byHour: byHourLists.map((list, h) => toBar(String(h), list)),
    byDuration: buckets.map((b) => toBar(b.label, games.filter((g) => {
      const min = (g.m.duration ?? 0) / 60; return min >= b.min && min < b.max;
    }))),
    sessionWinRate: recent.map((s) => ({ label: sessionLabel(s), value: rate(s).rate ?? 0 })),
    sessionGold: perSession((g) => (g.me.gold / Math.max(1, g.m.duration)) * 60, 0),
    sessionKp: perSession((g) => {
      const team = g.m.teamKills?.[String(g.me.team)] ?? 0;
      return team ? ((g.me.k + g.me.a) / team) * 100 : 0;
    }),
    sessionVision: perSession((g) => (g.me.vision / Math.max(1, g.m.duration)) * 60, 2),
    records: records(games),
    heat,
    insights: [],
  };
  result.insights = insights(result);
  return result;
}

/** Frases cortas sacadas de los datos. Solo se dicen cosas con suficientes partidas detrás (mínimo 5). */
function insights(s: SeasonStats): string[] {
  const out: string[] = [];
  const MIN = 5;
  const best = (bars: Bar[]) => bars.filter((b) => b.games >= MIN && b.rate !== null).sort((a, b) => b.rate! - a.rate!)[0];
  const day = best(s.byDay);
  if (day && day.rate! > s.winRate + 3) out.push(`Los ${day.label.toLowerCase()} son tu mejor día: ganas el ${day.rate}%.`);
  const dur = best(s.byDuration);
  if (dur && dur.rate! > s.winRate + 3) out.push(`Rindes mejor en partidas de ${dur.label} minutos (${dur.rate}% de victorias).`);
  if (s.afterLoss.games >= MIN && s.afterWin.games >= MIN) {
    const diff = Math.round((s.afterLoss.rate! - s.afterWin.rate!) * 10) / 10;
    if (diff >= 5) out.push(`Te recuperas bien: tras una derrota ganas el ${s.afterLoss.rate}%.`);
    else if (diff <= -5) out.push(`Después de perder bajas al ${s.afterLoss.rate}%: una pausa entre partidas puede ayudar.`);
  }
  if (s.blue.games >= MIN && s.red.games >= MIN && Math.abs((s.blue.rate ?? 0) - (s.red.rate ?? 0)) >= 6) {
    const side = (s.blue.rate ?? 0) > (s.red.rate ?? 0) ? 'azul' : 'rojo';
    out.push(`Juegas mejor en el lado ${side}.`);
  }
  return out.slice(0, 3);
}

function records(games: Game[]): RecordRow[] {
  const defs: { label: string; get: (g: Game) => number; show?: (v: number, g: Game) => string; min?: number; lowest?: boolean; only?: (g: Game) => boolean }[] = [
    { label: 'Asesinatos', get: (g) => g.me.k },
    { label: 'Asistencias', get: (g) => g.me.a },
    { label: 'Racha de asesinatos', get: (g) => g.me.spree },
    { label: 'Multiasesinato', get: (g) => g.me.multi, show: (v) => ['', 'Simple', 'Doble', 'Triple', 'Cuádruple', 'Pentakill'][v] ?? `${v}`, min: 2 },
    { label: 'Daño a campeones', get: (g) => g.me.dmg, show: fmt },
    { label: 'Daño recibido', get: (g) => g.me.taken, show: fmt },
    { label: 'Curación total', get: (g) => g.me.heal, show: fmt },
    { label: 'Oro conseguido', get: (g) => g.me.gold, show: fmt },
    { label: 'Súbditos y monstruos (CS)', get: (g) => g.me.cs },
    { label: 'Puntuación de visión', get: (g) => g.me.vision },
    { label: 'Centinelas colocados', get: (g) => g.me.wards },
    { label: 'Centinelas eliminados', get: (g) => g.me.wardsKilled },
    { label: 'Torres destruidas', get: (g) => g.me.turrets },
    { label: 'Dragones', get: (g) => g.me.dragons },
    { label: 'Barones', get: (g) => g.me.barons },
    { label: 'Partida más larga', get: (g) => g.m.duration, show: (v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` },
    { label: 'Victoria más rápida', get: (g) => g.m.duration, lowest: true, only: (g) => g.win, show: (v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` },
  ];
  const rows: RecordRow[] = [];
  for (const d of defs) {
    let best: Game | null = null; let bestV = d.lowest ? Infinity : -Infinity;
    for (const g of games) {
      if (d.only && !d.only(g)) continue;
      const v = d.get(g);
      if (d.lowest ? v < bestV : v > bestV) { best = g; bestV = v; }
    }
    if (!best || !Number.isFinite(bestV) || bestV <= 0 || (d.min && bestV < d.min)) continue;
    rows.push({ label: d.label, value: d.show ? d.show(bestV, best) : String(bestV), champ: best.me.champ, champId: best.me.champId, date: best.start, matchId: best.m.id });
  }
  return rows;
}

/** Partidas por día (fecha en Colombia) para la línea de actividad del perfil */
export function activityByDay(games: Game[]): Map<string, number> {
  const fmtDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const map = new Map<string, number>();
  for (const g of games) { const k = fmtDay.format(new Date(g.start)); map.set(k, (map.get(k) ?? 0) + 1); }
  return map;
}
