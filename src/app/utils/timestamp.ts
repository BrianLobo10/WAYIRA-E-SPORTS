/**
 * Fecha con la misma forma que el Timestamp de Firebase (toDate, toMillis, seconds…).
 * Permite que las páginas existentes sigan usando `fecha.toDate()` sin depender de Firebase.
 */
export class Timestamp {
  constructor(
    readonly seconds: number,
    readonly nanoseconds: number,
  ) {}

  static fromDate(date: Date): Timestamp {
    const ms = date.getTime();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }

  static fromMillis(ms: number): Timestamp {
    return Timestamp.fromDate(new Date(ms));
  }

  static now(): Timestamp {
    return Timestamp.fromDate(new Date());
  }

  toDate(): Date {
    return new Date(this.toMillis());
  }

  toMillis(): number {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }

  isEqual(other: Timestamp): boolean {
    return other.seconds === this.seconds && other.nanoseconds === this.nanoseconds;
  }

  valueOf(): string {
    return String(this.toMillis()).padStart(15, '0');
  }

  toJSON(): { seconds: number; nanoseconds: number } {
    return { seconds: this.seconds, nanoseconds: this.nanoseconds };
  }
}
