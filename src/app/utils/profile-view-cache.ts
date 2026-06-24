import { Timestamp } from '@angular/fire/firestore';
import type { UserProfile } from '../services/firebase.service';

const PREFIX = 'wayira_prof_v1_';

/** Caché de vista del perfil: acelera la siguiente visita sin sustituir datos en servidor */
export const PROFILE_VIEW_CACHE_TTL_MS = 45 * 60 * 1000;

function serialize(p: UserProfile): Record<string, unknown> {
  return {
    uid: p.uid,
    email: p.email,
    displayName: p.displayName,
    photoURL: p.photoURL,
    coverImageURL: p.coverImageURL,
    role: p.role,
    gameName: p.gameName,
    tagLine: p.tagLine,
    region: p.region,
    puuid: p.puuid,
    riotVerified: p.riotVerified,
    followers: p.followers,
    following: p.following,
    createdAt: p.createdAt?.toMillis?.() ?? Date.now(),
    bio: p.bio,
    riotSnapshot: (p as unknown as { riotSnapshot?: unknown }).riotSnapshot
  };
}

function deserialize(data: Record<string, unknown>): UserProfile {
  const createdMs = data['createdAt'];
  const createdAt =
    typeof createdMs === 'number' ? Timestamp.fromMillis(createdMs) : (data['createdAt'] as UserProfile['createdAt']);
  const base: Record<string, unknown> = {
    uid: data['uid'],
    email: data['email'],
    displayName: data['displayName'],
    photoURL: data['photoURL'],
    coverImageURL: data['coverImageURL'],
    role: data['role'],
    gameName: data['gameName'],
    tagLine: data['tagLine'],
    region: data['region'],
    puuid: data['puuid'],
    riotVerified: data['riotVerified'],
    followers: data['followers'],
    following: data['following'],
    createdAt,
    bio: data['bio']
  };
  if (data['riotSnapshot'] != null) base['riotSnapshot'] = data['riotSnapshot'];
  return base as unknown as UserProfile;
}

export function readCachedUserProfile(uid: string): UserProfile | null {
  try {
    const raw = localStorage.getItem(PREFIX + uid);
    if (!raw) return null;
    const wrap = JSON.parse(raw) as { at: number; profile: Record<string, unknown> };
    if (!wrap.profile || wrap.at + PROFILE_VIEW_CACHE_TTL_MS < Date.now()) return null;
    return deserialize(wrap.profile);
  } catch {
    return null;
  }
}

export function writeCachedUserProfile(uid: string, profile: UserProfile): void {
  try {
    localStorage.setItem(
      PREFIX + uid,
      JSON.stringify({ at: Date.now(), profile: serialize(profile) })
    );
  } catch {
    /* quota / privado */
  }
}

export function removeCachedUserProfile(uid: string): void {
  try {
    localStorage.removeItem(PREFIX + uid);
  } catch {
    /* noop */
  }
}
