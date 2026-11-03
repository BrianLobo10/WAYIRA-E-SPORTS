/** Utilidades compartidas por los juegos de sorteo. Todo el azar sale de crypto (no de Math.random). */

/** Entero aleatorio uniforme en [0, max). */
export function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / max) * max; // evita sesgo de módulo
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % max;
}

/** Número aleatorio en [0, 1). */
export function random(): number {
  return randomInt(1_000_000) / 1_000_000;
}

/** Copia barajada (Fisher–Yates). */
export function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Colores de los participantes: bien distintos entre sí para reconocer cada carro de un vistazo. */
export const GAME_COLORS = ['#D7FF3F', '#FF5A36', '#ECEAE3', '#7CB8FF', '#C79BFF', '#FFB13D', '#5EE6B0', '#FF8FB8'];
