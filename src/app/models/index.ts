/**
 * Modelos de datos de WAYIRA (antes vivían en firebase.service.ts).
 * Las fechas usan `Timestamp` propio (utils/timestamp) con la misma forma que el de Firebase,
 * para que las plantillas que llaman a `.toDate()` sigan funcionando.
 */
import { Timestamp } from '../utils/timestamp';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  coverImageURL?: string;
  role: 'user' | 'admin';
  gameName?: string;
  tagLine?: string;
  region?: string;
  puuid?: string;
  riotVerified?: boolean;
  followers?: string[];
  following?: string[];
  createdAt: Timestamp;
  bio?: string;
}

export interface Post {
  id?: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string | null;
  content: string;
  images?: string[];
  video?: string;
  likes: string[];
  dislikes?: string[];
  /** Reacción de cada usuario (userId → tipo). Incluye like/dislike y las demás. */
  reactions?: Record<string, ReactionKind>;
  comments: Comment[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ReactionKind = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry' | 'dislike';

export interface Comment {
  id?: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string | null;
  content: string;
  likes: string[];
  dislikes: string[];
  createdAt: Timestamp;
  replies?: Comment[]; // Respuestas anidadas
  parentId?: string; // ID del comentario padre (si es una respuesta)
  /** Reacción de cada usuario (userId → tipo) */
  reactions?: Record<string, ReactionKind>;
  /** Fecha de la última edición (si se editó) */
  editedAt?: Timestamp | null;
  /** Respuesta a otra respuesta: a quién se responde */
  replyToId?: string | null;
  replyToName?: string | null;
}

export interface News {
  id?: string;
  title: string;
  content: string;
  excerpt: string;
  category: string;
  imageUrl?: string | null;
  authorId: string;
  authorName: string;
  published: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Tournament {
  id?: string;
  name: string;
  description: string;
  game: string;
  startDate: Timestamp;
  endDate: Timestamp;
  maxTeams: number;
  teams: Team[];
  status: 'upcoming' | 'ongoing' | 'finished' | 'confirmed';
  format?: 'single' | 'double';
  configuredRounds?: number;
  createdBy: string;
  createdAt: Timestamp;
  bracket?: BracketMatch[];
  lowerBracket?: BracketMatch[]; // bracket de recuperación (doble eliminación)
  confirmed?: boolean;
  confirmedAt?: Timestamp;
  prizePoolUsd?: number;
  /** Mejor de 1 o 3 en la gran final */
  grandFinalBestOf?: 1 | 3;
  /** Mejor de 1 o 3 en la final del bracket de redención */
  redemptionFinalBestOf?: 1 | 3;
  /** Cierre automático al completar finales */
  finishedAt?: Timestamp;
  /** Campeón del torneo (gran final) */
  championTeamId?: string;
  championTeamName?: string;
  /** Campeón del bracket de redención (2.º lugar) */
  redemptionChampionTeamId?: string;
  redemptionChampionTeamName?: string;
}

/** Estadísticas globales por equipo (torneos ganados) */
export interface TeamTournamentStats {
  teamId: string;
  teamName: string;
  tournamentsWon: number;
  updatedAt: Timestamp;
}

export interface PlayerInfo {
  userId?: string; // User ID de Firebase (opcional, puede no estar registrado)
  name: string; // Nombre real del jugador
  phone: string; // Teléfono de contacto
  email: string; // Correo electrónico
  gameName: string; // Nombre de invocador
  tagLine: string; // Tagline del invocador
  role?: string; // Rol en el equipo (opcional: Top, Jungle, Mid, ADC, Support)
  mainChampion?: string; // Campeón principal de LoL
}

/** Proyecto activo (Proyectos Activos en la página de proyectos). */
export interface ActiveProject {
  icon: string;
  title: string;
  description: string;
  status: string;
  date: string;
}

export interface Team {
  id: string;
  name: string;
  logo?: string; // URL del logo del equipo
  logoUrl?: string; // URL del logo del equipo (alternativa)
  captainId: string;
  captainName: string;
  players: string[]; // User IDs (para compatibilidad)
  playerInfo?: PlayerInfo[]; // Información detallada de cada jugador (opcional para compatibilidad)
  substitutes: string[]; // User IDs
  registeredAt: Timestamp;
}

export interface BracketMatch {
  id: string;
  round: string;
  bracketType?: 'upper' | 'lower';
  roundIndex?: number;
  roundLabel?: string;
  slotIndex?: number;
  team1Id?: string;
  team1Name?: string;
  team2Id?: string;
  team2Name?: string;
  score1?: number;
  score2?: number;
  bestOf?: number; // ej. 3 = al mejor de 3
  winnerId?: string;
  loserId?: string; // para enviar a bracket de recuperación
  loserGoesToMatchId?: string; // id del partido en lower bracket al que va el perdedor
  loserGoesToMatchSlot?: 'team1' | 'team2';
  nextMatchId?: string;
  nextMatchSlot?: 'team1' | 'team2';
  team1SourceMatchId?: string;
  team2SourceMatchId?: string;
  autoAdvance?: boolean;
  matchDate?: Timestamp;
}

export interface Message {
  id?: string;
  fromId: string;
  fromName: string;
  fromPhoto?: string;
  toId: string;
  content: string;
  timestamp: Timestamp;
  read: boolean;
}

export interface Conversation {
  id?: string;
  user1Id: string; // ID del primer usuario (menor lexicográficamente)
  user2Id: string; // ID del segundo usuario (mayor lexicográficamente)
  messages: Message[]; // Array de mensajes en la conversación
  lastMessage?: Message; // Último mensaje para facilitar consultas
  lastMessageTime?: Timestamp; // Timestamp del último mensaje
  createdAt: Timestamp; // Cuando se creó la conversación
  updatedAt: Timestamp; // Última actualización
}

export interface ContactMessage {
  id?: string;
  name: string;
  email: string;
  subject?: string;
  message: string;
  contactType: string;
  createdAt: Timestamp;
  read: boolean;
}

export interface Notification {
  id?: string;
  userId: string; // Usuario que recibe la notificación
  type: 'like' | 'comment' | 'comment_reply' | 'follow' | 'message';
  fromUserId: string; // Usuario que realiza la acción
  fromUserName: string;
  fromUserPhoto?: string | null;
  postId?: string; // Para likes y comments
  commentId?: string; // Para comments
  message?: string; // Para mensajes
  read: boolean;
  createdAt: Timestamp;
}
