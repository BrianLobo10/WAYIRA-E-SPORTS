import { Injectable } from '@angular/core';

const PREFIX = 'wy_';

/**
 * Ofuscación ligera para datos en sessionStorage/localStorage.
 * No sustituye cifrado real; evita lectura casual y rastreo de claves.
 * Para secretos reales usar backend y nunca guardarlos en el cliente.
 */
@Injectable({ providedIn: 'root' })
export class SecureStorageService {

  private encode(s: string): string {
    try {
      return btoa(encodeURIComponent(s));
    } catch {
      return s;
    }
  }

  private decode(s: string): string {
    try {
      return decodeURIComponent(atob(s));
    } catch {
      return s;
    }
  }

  private key(k: string): string {
    return PREFIX + this.encode(k);
  }

  setSession(key: string, value: string): void {
    try {
      sessionStorage.setItem(this.key(key), this.encode(value));
    } catch (_) {}
  }

  getSession(key: string): string | null {
    try {
      const v = sessionStorage.getItem(this.key(key));
      return v ? this.decode(v) : null;
    } catch {
      return null;
    }
  }

  removeSession(key: string): void {
    try {
      sessionStorage.removeItem(this.key(key));
    } catch (_) {}
  }

  setLocal(key: string, value: string): void {
    try {
      localStorage.setItem(this.key(key), this.encode(value));
    } catch (_) {}
  }

  getLocal(key: string): string | null {
    try {
      const v = localStorage.getItem(this.key(key));
      return v ? this.decode(v) : null;
    } catch {
      return null;
    }
  }

  removeLocal(key: string): void {
    try {
      localStorage.removeItem(this.key(key));
    } catch (_) {}
  }
}
