import * as XLSX from 'xlsx';
import type { PlayerInfo, Team } from '../services/firebase.service';

const ROSTER_ROLES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'] as const;

function normHeader(s: string): string {
  return (s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function cell(row: string[], i: number): string {
  if (i < 0 || i >= row.length) return '';
  const v = row[i];
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** Detecta columnas típicas de respuestas de Google Forms / Excel Wayira */
export function detectRegistrationColumns(headers: string[]): {
  teamName: number;
  teamTag: number;
  capName: number;
  capEmail: number;
  capWa: number;
  capDc: number;
  playerStart: number;
  sub1: number;
  sub2: number;
} | null {
  const n = headers.length;
  if (n < 8) return null;

  const hn = headers.map(normHeader);

  const find = (pred: (h: string) => boolean) => {
    const i = hn.findIndex(pred);
    return i >= 0 ? i : -1;
  };

  let teamName = find(
    h =>
      h.includes('nombre del equipo') ||
      (h.includes('nombre') && h.includes('equipo') && !h.includes('completo') && !h.includes('capitan'))
  );
  let teamTag = find(h => h.includes('tag del equipo') || (h.includes('tag') && h.includes('equipo')));
  let capName = find(h => h.includes('nombre del capitan') || (h.includes('capitan') && h.includes('nombre')));
  let capEmail = find(h => h.includes('correo del capitan') || (h.includes('correo') && h.includes('capitan')));
  let capWa = find(h => h.includes('whatsapp'));
  let capDc = find(h => h.includes('discord') && h.includes('capitan'));
  if (capDc < 0) capDc = find(h => h.includes('discord del capitan') || h === 'discord del capitan');

  const sub1 = find(h => h.includes('suplente') && (h.includes('1') || h.endsWith(' 1') || h.endsWith('1')));
  const sub2 = find(h => h.includes('suplente') && (h.includes('2') || h.endsWith(' 2') || h.endsWith('2')));

  let playerStart = -1;
  if (capDc >= 0) playerStart = capDc + 1;
  else if (capWa >= 0) playerStart = capWa + 1;
  else playerStart = 8;

  const fixed = {
    teamName: teamName >= 0 ? teamName : 2,
    teamTag: teamTag >= 0 ? teamTag : 3,
    capName: capName >= 0 ? capName : 4,
    capEmail: capEmail >= 0 ? capEmail : 5,
    capWa: capWa >= 0 ? capWa : 6,
    capDc: capDc >= 0 ? capDc : 7,
    playerStart,
    sub1: sub1 >= 0 ? sub1 : Math.min(playerStart + 20, Math.max(0, n - 2)),
    sub2: sub2 >= 0 ? sub2 : Math.min(playerStart + 21, Math.max(0, n - 1))
  };

  return fixed;
}

export interface RegistrationImportResult {
  /** Equipos listos salvo `id` y `registeredAt` */
  teams: Array<Omit<Team, 'id' | 'registeredAt'>>;
  errors: string[];
  warnings: string[];
}

function buildPlayerInfo(partial: Partial<PlayerInfo> & { name: string }): PlayerInfo {
  return {
    name: partial.name,
    phone: partial.phone ?? '',
    email: partial.email ?? '',
    gameName: partial.gameName ?? '—',
    tagLine: partial.tagLine ?? '—',
    role: partial.role,
    mainChampion: partial.mainChampion
  };
}

export function parseRegistrationRows(rows: string[][]): RegistrationImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const teams: Array<Omit<Team, 'id' | 'registeredAt'>> = [];

  if (!rows?.length) {
    errors.push('El archivo está vacío.');
    return { teams, errors, warnings };
  }

  const headers = rows[0].map(c => String(c ?? ''));
  const cols = detectRegistrationColumns(headers);
  if (!cols) {
    errors.push('No se reconocen las columnas. Usa la plantilla de inscripción (fila de encabezados).');
    return { teams, errors, warnings };
  }

  const dataRows = rows.slice(1).filter(r => r.some(c => String(c ?? '').trim() !== ''));

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    const line = r + 2;
    const teamNameRaw = cell(row, cols.teamName);
    if (!teamNameRaw) {
      warnings.push(`Fila ${line}: sin nombre de equipo, omitida.`);
      continue;
    }

    const tag = cell(row, cols.teamTag);
    const displayName = tag ? `${teamNameRaw} [${tag}]` : teamNameRaw;

    const capName = cell(row, cols.capName) || '—';
    const capEmail = cell(row, cols.capEmail);
    const capWa = cell(row, cols.capWa);
    const capDc = cell(row, cols.capDc);

    const playerInfo: PlayerInfo[] = [];

    playerInfo.push(
      buildPlayerInfo({
        name: capName,
        email: capEmail,
        phone: capWa,
        gameName: '—',
        tagLine: '—',
        role: 'Capitán',
        mainChampion: capDc ? `Discord: ${capDc}` : undefined
      })
    );

    for (let p = 0; p < 5; p++) {
      const base = cols.playerStart + p * 4;
      const fullName = cell(row, base);
      const nick = cell(row, base + 1);
      const riot = cell(row, base + 2);
      const rank = cell(row, base + 3);
      if (!fullName && !nick && !riot) continue;
      playerInfo.push(
        buildPlayerInfo({
          name: fullName || nick || `Titular ${p + 1}`,
          email: '',
          phone: '',
          gameName: nick || '—',
          tagLine: riot || '—',
          role: ROSTER_ROLES[p],
          mainChampion: rank ? `Rango: ${rank}` : undefined
        })
      );
    }

    const s1 = cols.sub1 >= 0 ? cell(row, cols.sub1) : '';
    const s2 = cols.sub2 >= 0 ? cell(row, cols.sub2) : '';
    if (s1) {
      playerInfo.push(
        buildPlayerInfo({
          name: s1,
          email: '',
          phone: '',
          gameName: '—',
          tagLine: '—',
          role: 'Suplente 1'
        })
      );
    }
    if (s2) {
      playerInfo.push(
        buildPlayerInfo({
          name: s2,
          email: '',
          phone: '',
          gameName: '—',
          tagLine: '—',
          role: 'Suplente 2'
        })
      );
    }

    teams.push({
      name: displayName,
      captainId: `import-pending-${teams.length}`,
      captainName: capName,
      players: [],
      playerInfo,
      substitutes: []
    });
  }

  if (!teams.length && !errors.length) {
    errors.push('No se importó ningún equipo (filas vacías o sin nombre de equipo).');
  }

  return { teams, errors, warnings };
}

/** Lee .xlsx, .xls o .csv (UTF-8) y devuelve filas como string[][] */
export async function readSpreadsheetFile(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  const isCsv = name.endsWith('.csv');

  const wb = XLSX.read(buf, {
    type: 'array',
    raw: false,
    codepage: 65001,
    ...(isCsv ? { FS: ',', RS: '\n' } : {})
  } as XLSX.ParsingOptions);

  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: '',
    raw: false
  }) as string[][];
}
