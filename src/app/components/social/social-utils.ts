import { Post } from '../../models';

/** Fecha corta tipo red social: "Ahora", "5 min", "3 h", "2 d", "12 nov" */
export function timeAgo(ts: unknown): string {
  const d = toDate(ts);
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'Ahora';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} d`;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).replace('.', '');
}

/** Fecha y hora completas (para el título al pasar el cursor) */
export function fullDate(ts: unknown): string {
  const d = toDate(ts);
  return d ? d.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }) : '';
}

export function toDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  const t = ts as { toDate?: () => Date };
  return typeof t.toDate === 'function' ? t.toDate() : null;
}

/** Se editó si la última modificación es más de 1 min posterior a la creación */
export function wasEdited(created: unknown, updated: unknown): boolean {
  const a = toDate(created); const b = toDate(updated);
  return !!a && !!b && b.getTime() - a.getTime() > 60_000;
}

export function postUrl(post: Post): string {
  return `${location.origin}/feed?post=${post.id}`;
}

export function initial(name: string | null | undefined): string {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}
