import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { 
  Firestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  query, 
  where, 
  orderBy, 
  limit,
  startAfter,
  getDocs,
  addDoc,
  Timestamp,
  increment,
  onSnapshot,
  QuerySnapshot,
  DocumentData,
  collectionData,
  collectionSnapshots
} from '@angular/fire/firestore';
import { 
  Auth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithPhoneNumber,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User,
  updateProfile,
  sendEmailVerification
} from '@angular/fire/auth';
import type { ConfirmationResult, ApplicationVerifier } from 'firebase/auth';
import { 
  Storage, 
  ref, 
  uploadBytes, 
  getDownloadURL,
  deleteObject 
} from '@angular/fire/storage';
import { Observable, from, map, switchMap, BehaviorSubject, interval } from 'rxjs';
import { RiotApiService } from './riot-api.service';
import { Router } from '@angular/router';
import { removeCachedUserProfile } from '../utils/profile-view-cache';

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
  comments: Comment[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

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

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
const REMEMBER_KEY = 'wayira_remember';

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private storage = inject(Storage);
  private riotApiService = inject(RiotApiService);
  private router = inject(Router);
  private injector = inject(Injector);

  private currentUser$ = new BehaviorSubject<User | null>(null);
  public currentUser = this.currentUser$.asObservable();
  /** Resuelve cuando Firebase Auth ha emitido el primer estado (evita flash de login al recargar) */
  private authReady$ = new BehaviorSubject<boolean>(false);
  private summonerUpdateInterval: any = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private idleReset = () => this.resetIdleTimer();

  constructor() {
    onAuthStateChanged(this.auth, (user: User | null) => {
      this.currentUser$.next(user);
      if (!this.authReady$.value) this.authReady$.next(true);
      if (user) this.startIdleTimeout();
      else this.clearIdleTimeout();
    });
  }

  /**
   * Espera a que Firebase Auth haya emitido el primer estado antes de decidir si hay sesión.
   * Evita mostrar la página de login por un instante al recargar con sesión abierta.
   */
  waitForAuthInit(timeoutMs: number = 3000): Promise<void> {
    if (this.authReady$.value) return Promise.resolve();
    return new Promise((resolve) => {
      const sub = this.authReady$.subscribe((ready) => {
        if (ready) {
          sub.unsubscribe();
          resolve();
        }
      });
      setTimeout(() => {
        sub.unsubscribe();
        resolve();
      }, timeoutMs);
    });
  }

  private startIdleTimeout() {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(REMEMBER_KEY) === '1') return; // Recordarme: no cerrar por inactividad
    this.resetIdleTimer();
    if (typeof window !== 'undefined') {
      window.addEventListener('click', this.idleReset);
      window.addEventListener('keydown', this.idleReset);
      window.addEventListener('mousemove', this.idleReset);
    }
  }

  private resetIdleTimer() {
    this.clearIdleTimeout();
    this.idleTimer = setTimeout(() => {
      this.logout();
      this.router.navigate(['/login'], { replaceUrl: true });
    }, IDLE_TIMEOUT_MS);
  }

  private clearIdleTimeout() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('click', this.idleReset);
      window.removeEventListener('keydown', this.idleReset);
      window.removeEventListener('mousemove', this.idleReset);
    }
  }

  // Auth Methods
  async registerWithRiot(gameName: string, tagLine: string, region: string, puuid: string, password: string, userEmail: string, riotVerified: boolean = false) {
    // Validar que el email sea válido y obligatorio
    if (!userEmail || !userEmail.trim()) {
      throw new Error('El email es requerido');
    }
    
    if (!this.isValidEmail(userEmail)) {
      throw new Error('El email proporcionado no es válido');
    }
    
    // Usar el email proporcionado por el usuario
    const authEmail = userEmail.trim();
    
    // Validar que la contraseña cumpla con los requisitos de Firebase
    if (password.length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres');
    }
    
    // Verificar si el usuario ya existe por puuid (solo si hay puuid y está verificado)
    if (puuid && riotVerified) {
      try {
        const existingUser = await this.findUserByPuuid(puuid);
        if (existingUser) {
          throw new Error('Esta cuenta de Riot Games ya está registrada');
        }
      } catch (error: any) {
        if (error.message?.includes('ya está registrada')) {
          throw error;
        }
        // Si hay otro error, continuar con el registro
      }
    }
    
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, authEmail, password);
      const user = userCredential.user;
      
      // Enviar email de verificación de Firebase
      if (userEmail && userEmail.includes('@')) {
        try {
          await sendEmailVerification(user);
          console.log('Email de verificación enviado a', userEmail);
        } catch (error: any) {
          console.warn('No se pudo enviar email de verificación:', error.message);
          // No bloquear el registro si falla el envío de email
        }
      }
      
      const userProfile: UserProfile = {
        uid: user.uid,
        email: userEmail || authEmail, // Guardar el email real del usuario si se proporciona
        displayName: gameName,
        role: 'user',
        gameName,
        tagLine,
        region,
        puuid: puuid || undefined,
        riotVerified,
        followers: [],
        following: [],
        createdAt: Timestamp.now()
      };

      // Crear el perfil en Firestore - con manejo de errores específico
      try {
        await setDoc(doc(this.firestore, 'users', user.uid), userProfile);
        console.log('Perfil de usuario creado exitosamente en Firestore:', user.uid);
      } catch (profileError: any) {
        console.error('Error al crear perfil en Firestore:', profileError);
        // Si falla la creación del perfil, intentar crear uno básico
        try {
          await this.createDefaultProfile(user.uid, user);
          // Si el perfil básico se creó, actualizar con los datos del registro
          await updateDoc(doc(this.firestore, 'users', user.uid), {
            gameName,
            tagLine,
            region,
            puuid: puuid || undefined,
            riotVerified
          });
          console.log('Perfil básico creado y actualizado con datos de registro');
        } catch (fallbackError: any) {
          console.error('Error al crear perfil de respaldo:', fallbackError);
          // Lanzar error para que el usuario sepa que hubo un problema
          throw new Error('El usuario se creó pero hubo un problema al guardar el perfil. Por favor, intenta iniciar sesión y actualiza tu perfil manualmente.');
        }
      }

      // Actualizar el perfil de Firebase Auth
      try {
        await updateProfile(user, { displayName: gameName });
      } catch (authError: any) {
        console.warn('No se pudo actualizar el perfil de Auth:', authError.message);
        // No bloquear el registro si falla la actualización de Auth
      }
      
      return user;
    } catch (error: any) {
      // Manejar errores específicos de Firebase Auth
      console.error('Error en registro Firebase Auth:', error);
      
      if (error.code === 'auth/email-already-in-use') {
        // Verificar si existe un perfil en Firestore para este email
        // Si no existe, es un usuario huérfano (borrado de Firestore pero no de Auth)
        try {
          const usersRef = collection(this.firestore, 'users');
          const q = query(usersRef, where('email', '==', authEmail), limit(1));
          const querySnapshot = await getDocs(q);
          
          if (querySnapshot.empty) {
            // No hay perfil en Firestore, es un usuario huérfano
            throw new Error('Este email está registrado en el sistema pero no tiene perfil. Por favor contacta al administrador o intenta iniciar sesión. Si no recuerdas tu contraseña, puedes usar "Olvidé mi contraseña".');
          } else {
            // Existe el perfil, el email realmente está en uso
            throw new Error('Este email ya está registrado. Por favor usa otro email o inicia sesión.');
          }
        } catch (checkError: any) {
          // Si hay error al verificar, lanzar el mensaje apropiado
          if (checkError.message.includes('huérfano') || checkError.message.includes('contacta')) {
            throw checkError;
          }
          // Si hay otro error (permisos, etc.), mostrar mensaje genérico
          throw new Error('Este email ya está registrado. Por favor usa otro email o inicia sesión.');
        }
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('El email proporcionado no es válido.');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('La contraseña es muy débil. Debe tener al menos 6 caracteres.');
      } else if (error.code === 'auth/operation-not-allowed') {
        throw new Error('El registro con email/contraseña no está habilitado. Contacta al administrador.');
      } else if (error.code === 'auth/network-request-failed') {
        throw new Error('Error de conexión. Verifica tu conexión a internet e intenta nuevamente.');
      } else if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error('Error al crear la cuenta. Por favor intenta nuevamente o contacta al administrador.');
      }
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Función para recrear perfil si el usuario existe en Auth pero no en Firestore
  async recreateProfileIfOrphaned(email: string, password: string): Promise<User | null> {
    try {
      // Intentar iniciar sesión con el email y contraseña
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      const user = userCredential.user;
      
      // Verificar si existe perfil en Firestore
      const userDoc = await getDoc(doc(this.firestore, 'users', user.uid));
      
      if (!userDoc.exists()) {
        // Usuario huérfano: existe en Auth pero no en Firestore
        // Retornar el usuario para que se pueda recrear el perfil
        return user;
      }
      
      // El perfil existe, retornar null
      return null;
    } catch (error: any) {
      // Si no puede iniciar sesión, retornar null
      return null;
    }
  }

  // Función para recrear el perfil de usuario en Firestore
  async recreateUserProfile(uid: string, gameName: string, tagLine: string, region: string, puuid: string, email: string): Promise<void> {
    const userProfile: UserProfile = {
      uid: uid,
      email: email,
      displayName: gameName,
      role: 'user',
      gameName,
      tagLine,
      region,
      puuid,
      followers: [],
      following: [],
      createdAt: Timestamp.now()
    };

    await setDoc(doc(this.firestore, 'users', uid), userProfile);
    await updateProfile(this.auth.currentUser!, { displayName: gameName });
  }

  async loginWithRiot(gameName: string, tagLine: string, region: string, puuid: string | null, password: string, rememberMe: boolean = false) {
    // Intentar buscar usuario por puuid primero si está disponible
    let userProfile: UserProfile | null = null;
    
    if (puuid) {
      userProfile = await this.findUserByPuuid(puuid);
    }
    
    // Si no se encontró por puuid, buscar por gameName y tagLine
    if (!userProfile) {
      userProfile = await this.findUserByGameNameTagLine(gameName, tagLine);
    }
    
    if (!userProfile) {
      throw new Error('Cuenta no registrada. Por favor regístrate primero.');
    }

    // Verificar que el gameName y tagLine coincidan
    if (!userProfile.gameName || !userProfile.tagLine) {
      throw new Error('Datos de usuario incompletos. Por favor regístrate nuevamente.');
    }

    if (userProfile.gameName.toLowerCase() !== gameName.toLowerCase() || 
        userProfile.tagLine.toLowerCase() !== tagLine.toLowerCase()) {
      throw new Error('Los datos de invocador no coinciden con la cuenta registrada');
    }

    // Verificar que la región coincida
    if (userProfile.region && region && userProfile.region.toLowerCase() !== region.toLowerCase()) {
      throw new Error(`La región no coincide. Tu cuenta está registrada en la región ${userProfile.region.toUpperCase()}.`);
    }

    // El email está en el formato puuid@riot.wayira.local
    // Pero usamos el email del perfil si existe, o el generado
    const email = userProfile.email && userProfile.email.includes('@') 
      ? userProfile.email 
      : `${userProfile.puuid || userProfile.uid}@riot.wayira.local`;
    
    // Configurar persistencia de sesión
    const { setPersistence, browserLocalPersistence, browserSessionPersistence } = await import('firebase/auth');
    const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(this.auth, persistence);
    
    // Intentar iniciar sesión con la contraseña proporcionada
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      
      // Verificar que el uid coincida con el del perfil
      if (userCredential.user.uid !== userProfile.uid) {
        console.warn(`UID mismatch: Auth uid (${userCredential.user.uid}) != Profile uid (${userProfile.uid})`);
        console.warn('Esto puede indicar que el usuario tiene múltiples cuentas. El perfil se cargará usando el uid de Firebase Auth.');
      }
      
      return userCredential;
    } catch (error: any) {
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        throw new Error('Contraseña incorrecta. Verifica tus credenciales.');
      }
      throw new Error('Error al iniciar sesión. Por favor intenta nuevamente.');
    }
  }

  private async findUserByGameNameTagLine(gameName: string, tagLine: string): Promise<UserProfile | null> {
    try {
      const usersRef = collection(this.firestore, 'users');
      const q = query(
        usersRef,
        where('gameName', '==', gameName),
        where('tagLine', '==', tagLine),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        return null;
      }
      
      const docSnap = querySnapshot.docs[0];
      const data = docSnap.data() as DocumentData;
      return {
        id: docSnap.id,
        uid: (data['uid'] as string) || docSnap.id,
        email: (data['email'] as string) || '',
        displayName: (data['displayName'] as string) || '',
        role: (data['role'] as 'user' | 'admin') || 'user',
        gameName: data['gameName'] as string | undefined,
        tagLine: data['tagLine'] as string | undefined,
        region: data['region'] as string | undefined,
        puuid: data['puuid'] as string | undefined,
        photoURL: data['photoURL'] as string | undefined,
        bio: data['bio'] as string | undefined,
        followers: (data['followers'] as string[]) || [],
        following: (data['following'] as string[]) || [],
        createdAt: data['createdAt'] || Timestamp.now()
      } as UserProfile;
    } catch (error: any) {
      console.error('Error buscando usuario por gameName/tagLine:', error);
      return null;
    }
  }

  private async findUserByPuuid(puuid: string): Promise<UserProfile | null> {
    try {
      const usersRef = collection(this.firestore, 'users');
      const q = query(usersRef, where('puuid', '==', puuid), limit(1));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        return null;
      }
      
      const docSnap = querySnapshot.docs[0];
      const data = docSnap.data() as DocumentData;
      return {
        id: docSnap.id,
        uid: (data['uid'] as string) || docSnap.id,
      email: (data['email'] as string) || '',
      displayName: (data['displayName'] as string) || '',
      role: (data['role'] as 'user' | 'admin') || 'user',
      gameName: data['gameName'] as string | undefined,
      tagLine: data['tagLine'] as string | undefined,
      region: data['region'] as string | undefined,
      puuid: data['puuid'] as string | undefined,
      photoURL: data['photoURL'] as string | undefined,
      bio: data['bio'] as string | undefined,
      followers: (data['followers'] as string[]) || [],
      following: (data['following'] as string[]) || [],
      createdAt: data['createdAt'] || Timestamp.now()
    } as UserProfile;
    } catch (error: any) {
      console.error('Error buscando usuario por puuid:', error);
      // Si hay un error de contexto de inyección, retornar null y continuar
      if (error.message?.includes('injection context')) {
        console.warn('Firebase llamado fuera del contexto de inyección, continuando sin verificación');
        return null;
      }
      throw error;
    }
  }

  private generateSecurePassword(): string {
    // Generar contraseña aleatoria de 16 caracteres
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private generatePasswordFromPuuid(puuid: string): string {
    // Generar contraseña determinística basada en puuid (para login)
    // Esto permite que el usuario pueda iniciar sesión sin recordar contraseña
    // En producción, considera usar un método más seguro
    return btoa(puuid).substring(0, 16) + '!@#$';
  }

  async login(email: string, password: string) {
    return await signInWithEmailAndPassword(this.auth, email, password);
  }

  /** Iniciar sesión con Google. Crea perfil en Firestore si no existe. */
  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(this.auth, provider);
    const user = result.user;
    const existing = await this.getUserProfile(user.uid);
    if (!existing) {
      await this.createDefaultProfile(user.uid, user);
    }
    return result;
  }

  /** Establecer persistencia de sesión: local (recordarme) o solo sesión. */
  async setSessionPersistence(remember: boolean) {
    await setPersistence(this.auth, remember ? browserLocalPersistence : browserSessionPersistence);
    if (typeof localStorage !== 'undefined') {
      if (remember) localStorage.setItem(REMEMBER_KEY, '1');
      else localStorage.removeItem(REMEMBER_KEY);
    }
  }

  /** Enviar código SMS al teléfono. Devuelve ConfirmationResult para verificar después. */
  async sendPhoneVerificationCode(phoneNumber: string, appVerifier: ApplicationVerifier): Promise<ConfirmationResult> {
    return await signInWithPhoneNumber(this.auth, phoneNumber, appVerifier);
  }

  /** Verificar código SMS y completar inicio de sesión. Crea perfil si no existe. */
  async verifyPhoneCode(confirmationResult: ConfirmationResult, code: string) {
    const result = await confirmationResult.confirm(code);
    const user = result.user;
    const existing = await this.getUserProfile(user.uid);
    if (!existing) {
      await this.createDefaultProfile(user.uid, user);
    }
    return result;
  }

  async logout() {
    const uid = this.getCurrentUser()?.uid;
    if (uid) removeCachedUserProfile(uid);
    return await signOut(this.auth);
  }

  getCurrentUser(): User | null {
    // Use the BehaviorSubject value for immediate synchronous access
    // This is more reliable than auth.currentUser which can be null during initialization
    return this.currentUser$.value;
  }

  // User Profile Methods
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
      const docRef = doc(this.firestore, 'users', uid);
      const docSnap = await runInInjectionContext(this.injector, () => getDoc(docRef));
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        const role = data['role'] != null ? String(data['role']).trim().toLowerCase() : 'user';
        return {
          uid: docSnap.id,
          ...data,
          role: (role === 'admin' ? 'admin' : 'user') as 'user' | 'admin'
        } as UserProfile;
      } else {
        // Si no existe el perfil, verificar si el usuario está autenticado
        // y crear un perfil básico automáticamente
        const currentUser = this.getCurrentUser();
        if (currentUser && currentUser.uid === uid) {
          // Usuario autenticado sin perfil - crear uno básico
          console.log(`Creating default profile for authenticated user: ${uid}`);
          return await this.createDefaultProfile(uid, currentUser);
        } else {
          console.warn(`User profile not found for uid: ${uid}`);
          return null;
        }
      }
    } catch (error) {
      console.error(`Error getting user profile for uid ${uid}:`, error);
      // Intentar crear perfil básico si hay error y el usuario está autenticado
      const currentUser = this.getCurrentUser();
      if (currentUser && currentUser.uid === uid) {
        try {
          return await this.createDefaultProfile(uid, currentUser);
        } catch (createError) {
          console.error('Error creating default profile:', createError);
        }
      }
      return null;
    }
  }

  // Crear perfil básico para usuarios autenticados sin perfil
  private async createDefaultProfile(uid: string, authUser: User): Promise<UserProfile> {
    const displayName = authUser.displayName
      || authUser.email?.split('@')[0]
      || authUser.phoneNumber
      || 'Usuario';
    const defaultProfile: UserProfile = {
      uid: uid,
      email: authUser.email || '',
      displayName,
      photoURL: authUser.photoURL || undefined,
      role: 'user',
      followers: [],
      following: [],
      createdAt: Timestamp.now()
    };

    try {
      // Guardar el perfil en Firestore
      await setDoc(doc(this.firestore, 'users', uid), defaultProfile);
      console.log(`Default profile created for user: ${uid}`);
      return defaultProfile;
    } catch (error) {
      console.error('Error creating default profile in Firestore:', error);
      // Retornar el perfil básico aunque no se haya guardado en Firestore
      // para que la aplicación no falle
      return defaultProfile;
    }
  }

  // Observable para obtener el perfil del usuario en tiempo real
  getUserProfileRealtime(uid: string): Observable<UserProfile | null> {
    const docRef = doc(this.firestore, 'users', uid);
    return new Observable((observer) => {
      const unsubscribe = runInInjectionContext(this.injector, () => onSnapshot(docRef, 
        async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const role = data['role'] != null ? String(data['role']).trim().toLowerCase() : 'user';
            observer.next({
              uid: docSnap.id,
              ...data,
              role: (role === 'admin' ? 'admin' : 'user') as 'user' | 'admin'
            } as UserProfile);
          } else {
            // Si no existe el perfil, verificar si el usuario está autenticado
            // y crear un perfil básico automáticamente
            const currentUser = this.getCurrentUser();
            if (currentUser && currentUser.uid === uid) {
              try {
                const defaultProfile = await this.createDefaultProfile(uid, currentUser);
                observer.next(defaultProfile);
              } catch (error) {
                console.error('Error creating default profile in realtime:', error);
                observer.next(null);
              }
            } else {
              observer.next(null);
            }
          }
        },
        (error) => {
          console.error(`Error getting user profile for uid ${uid}:`, error);
          // Intentar crear perfil básico si hay error y el usuario está autenticado
          const currentUser = this.getCurrentUser();
          if (currentUser && currentUser.uid === uid) {
            this.createDefaultProfile(uid, currentUser).then(profile => {
              observer.next(profile);
            }).catch(err => {
              console.error('Error creating default profile:', err);
              observer.next(null);
            });
          } else {
            observer.next(null);
          }
        }
      ));
      return () => unsubscribe();
    });
  }

  async updateUserProfile(uid: string, data: Partial<UserProfile>) {
    const docRef = doc(this.firestore, 'users', uid);
    
    // Verificar si el documento existe
    const docSnap = await getDoc(docRef);
    
    // Si no existe, crear un perfil básico primero
    if (!docSnap.exists()) {
      const currentUser = this.getCurrentUser();
      if (currentUser && currentUser.uid === uid) {
        // Crear perfil básico primero
        await this.createDefaultProfile(uid, currentUser);
      } else {
        // Si no es el usuario actual, no podemos crear el perfil
        throw new Error('No se puede actualizar el perfil: el documento no existe y no se puede crear automáticamente');
      }
    }
    
    // Preparar los datos a actualizar
    const updateData: any = { ...data, updatedAt: Timestamp.now() };
    
    // Limpiar campos undefined
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });
    
    await updateDoc(docRef, updateData);
    
    // Si se actualizó la foto de perfil, actualizar también en publicaciones y comentarios
    if (data.photoURL !== undefined) {
      await this.updateUserPhotoInPosts(uid, data.photoURL);
    }
    
    // Si se actualizó el nombre, actualizar también en publicaciones y comentarios
    if (data.displayName !== undefined) {
      await this.updateUserNameInPosts(uid, data.displayName);
    }
    
    // Actualizar también Firebase Auth si el usuario actual coincide
    const currentUser = this.getCurrentUser();
    if (currentUser && currentUser.uid === uid) {
      try {
        const user = this.auth.currentUser;
        if (user) {
          const updateObj: any = {};
          if (data.displayName !== undefined) {
            updateObj.displayName = data.displayName;
          }
          if (data.photoURL !== undefined) {
            updateObj.photoURL = data.photoURL || null;
          }
          
          if (Object.keys(updateObj).length > 0) {
            await updateProfile(user, updateObj);
            console.log('Firebase Auth profile updated:', updateObj);
          }
        }
      } catch (error) {
        console.error('Error updating Firebase Auth profile:', error);
        // No fallar si no se puede actualizar Auth, pero continuar con Firestore
      }
    }
  }

  private readonly PROJECTS_CONFIG_PATH = 'config/projects';

  /** Obtiene la lista de proyectos activos (tiempo real). Si no hay en Firestore, devuelve array vacío. */
  getProjectsRealtime(): Observable<ActiveProject[]> {
    const docRef = doc(this.firestore, this.PROJECTS_CONFIG_PATH.split('/')[0], this.PROJECTS_CONFIG_PATH.split('/')[1]);
    return new Observable((observer) => {
      const unsubscribe = runInInjectionContext(this.injector, () =>
        onSnapshot(docRef, (snap) => {
          const items = snap.exists() ? (snap.data()['items'] as ActiveProject[] || []) : [];
          observer.next(Array.isArray(items) ? items : []);
        }, (err) => {
          console.error('Error loading projects:', err);
          observer.next([]);
        })
      );
      return () => unsubscribe();
    });
  }

  /** Guarda la lista de proyectos activos. Solo debe llamarse si el usuario es admin. */
  async setProjects(projects: ActiveProject[]): Promise<void> {
    const configRef = doc(this.firestore, this.PROJECTS_CONFIG_PATH.split('/')[0], this.PROJECTS_CONFIG_PATH.split('/')[1]);
    await setDoc(configRef, { items: projects, updatedAt: Timestamp.now() });
  }

  private async updateUserPhotoInPosts(uid: string, photoURL: string | undefined) {
    try {
      // Actualizar foto en publicaciones del usuario
      const postsQuery = query(
        collection(this.firestore, 'posts'),
        where('authorId', '==', uid)
      );
      const postsSnapshot = await getDocs(postsQuery);
      
      const updatePromises: Promise<void>[] = [];
      postsSnapshot.forEach((postDoc) => {
        const postRef = doc(this.firestore, 'posts', postDoc.id);
        updatePromises.push(updateDoc(postRef, { authorPhoto: photoURL || null }));
      });
      
      // Actualizar foto en comentarios del usuario en todas las publicaciones (incluyendo respuestas anidadas)
      const allPostsQuery = query(collection(this.firestore, 'posts'));
      const allPostsSnapshot = await getDocs(allPostsQuery);
      
      allPostsSnapshot.forEach((postDoc) => {
        const postData = postDoc.data() as Post;
        if (postData.comments && postData.comments.length > 0) {
          let hasChanges = false;
          const updatedComments = postData.comments.map((comment: Comment) => {
            let commentChanged = false;
            let updatedComment = { ...comment };
            
            // Actualizar foto del comentario principal
            if (comment.authorId === uid) {
              updatedComment = { ...updatedComment, authorPhoto: photoURL || null };
              commentChanged = true;
            }
            
            // Actualizar foto en respuestas anidadas
            if (comment.replies && comment.replies.length > 0) {
              const updatedReplies = comment.replies.map((reply: Comment) => {
                if (reply.authorId === uid) {
                  commentChanged = true;
                  return { ...reply, authorPhoto: photoURL || null };
                }
                return reply;
              });
              if (commentChanged || updatedReplies.some((r, i) => r !== comment.replies![i])) {
                updatedComment = { ...updatedComment, replies: updatedReplies };
              }
            }
            
            if (commentChanged) {
              hasChanges = true;
            }
            
            return updatedComment;
          });
          
          if (hasChanges) {
            const postRef = doc(this.firestore, 'posts', postDoc.id);
            updatePromises.push(updateDoc(postRef, { comments: updatedComments }));
          }
        }
      });
      
      await Promise.all(updatePromises);
    } catch (error) {
      console.error('Error updating user photo in posts:', error);
    }
  }

  private async updateUserNameInPosts(uid: string, displayName: string) {
    try {
      // Actualizar nombre en publicaciones del usuario
      const postsQuery = query(
        collection(this.firestore, 'posts'),
        where('authorId', '==', uid)
      );
      const postsSnapshot = await getDocs(postsQuery);
      
      const updatePromises: Promise<void>[] = [];
      postsSnapshot.forEach((postDoc) => {
        const postRef = doc(this.firestore, 'posts', postDoc.id);
        updatePromises.push(updateDoc(postRef, { authorName: displayName }));
      });
      
      // Actualizar nombre en comentarios del usuario en todas las publicaciones
      const allPostsQuery = query(collection(this.firestore, 'posts'));
      const allPostsSnapshot = await getDocs(allPostsQuery);
      
      allPostsSnapshot.forEach((postDoc) => {
        const postData = postDoc.data() as Post;
        if (postData.comments && postData.comments.length > 0) {
          const updatedComments = postData.comments.map((comment: Comment) => {
            if (comment.authorId === uid) {
              return { ...comment, authorName: displayName };
            }
            return comment;
          });
          
          const postRef = doc(this.firestore, 'posts', postDoc.id);
          updatePromises.push(updateDoc(postRef, { comments: updatedComments }));
        }
      });
      
      await Promise.all(updatePromises);
    } catch (error) {
      console.error('Error updating user name in posts:', error);
    }
  }

  async isAdmin(uid: string): Promise<boolean> {
    const profile = await this.getUserProfile(uid);
    const role = profile?.role != null ? String(profile.role).trim().toLowerCase() : '';
    return role === 'admin';
  }

  // Posts Methods
  async createPost(post: Partial<Post> & { authorId: string; authorName: string; content: string }): Promise<string> {
    const postsRef = collection(this.firestore, 'posts');
    
    // Construir el objeto del post omitiendo campos undefined
    const newPost: any = {
      authorId: post.authorId,
      authorName: post.authorName,
      content: post.content,
      authorPhoto: post.authorPhoto || null, // Asegurar que no sea undefined
      likes: [],
      dislikes: [],
      comments: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    // Solo agregar images si existe y tiene elementos
    if (post.images && Array.isArray(post.images) && post.images.length > 0) {
      newPost.images = post.images;
    }
    
    // Solo agregar video si existe (no undefined ni null)
    if (post.video && typeof post.video === 'string') {
      newPost.video = post.video;
    }
    
    const docRef = await addDoc(postsRef, newPost);
    return docRef.id;
  }

  getPosts(limitCount: number = 20): Observable<Post[]> {
    const postsRef = collection(this.firestore, 'posts');
    const q = query(postsRef, orderBy('createdAt', 'desc'), limit(limitCount));
    return collectionSnapshots(q).pipe(
      map((docs) => docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Post)))
    );
  }

  getPostById(postId: string): Observable<Post | null> {
    const postRef = doc(this.firestore, 'posts', postId);
    return new Observable(observer => {
      const unsubscribe = onSnapshot(postRef, 
        (docSnap: any) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            observer.next({ id: docSnap.id, ...data } as Post);
          } else {
            observer.next(null);
          }
        }, 
        (error) => {
          console.error('Error getting post:', error);
          observer.error(error);
        }
      );
      return () => unsubscribe();
    });
  }

  async likePost(postId: string, userId: string) {
    const postRef = doc(this.firestore, 'posts', postId);
    const postSnap = await getDoc(postRef);
    if (postSnap.exists()) {
      const post = postSnap.data() as Post;
      const likes = post.likes || [];
      const dislikes = post.dislikes || [];
      const wasLiked = likes.includes(userId);
      const wasDisliked = dislikes.includes(userId);
      
      let updateData: any = {};
      
      if (wasLiked) {
        updateData.likes = likes.filter(id => id !== userId);
      } else {
        // Remover de dislikes si estaba ahí
        const newDislikes = wasDisliked ? dislikes.filter(id => id !== userId) : dislikes;
        updateData.likes = [...likes, userId];
        if (wasDisliked) {
          updateData.dislikes = newDislikes;
        }
        
        // Crear notificación solo si no es el propio autor
        // Envolver en try-catch para que si falla la notificación, no afecte el like
        try {
          if (post.authorId !== userId) {
            const currentUser = await this.getUserProfile(userId);
            await this.createNotification({
              userId: post.authorId,
              type: 'like',
              fromUserId: userId,
              fromUserName: currentUser?.displayName || 'Usuario',
              fromUserPhoto: currentUser?.photoURL || null,
              postId: postId,
              read: false
            });
          }
        } catch (notificationError) {
          // Si falla la notificación, solo loguear el error pero no lanzarlo
          // El like ya se actualizó correctamente
          console.warn('Error creando notificación de like:', notificationError);
        }
      }
      
      // Filtrar campos undefined
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });
      
      await updateDoc(postRef, updateData);
    }
  }

  async updatePost(postId: string, updates: Partial<Post>): Promise<void> {
    const postRef = doc(this.firestore, 'posts', postId);
    const updateData: any = {
      ...updates,
      updatedAt: Timestamp.now()
    };
    
    // Limpiar campos undefined
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });
    
    await updateDoc(postRef, updateData);
  }

  async deletePost(postId: string): Promise<void> {
    const postRef = doc(this.firestore, 'posts', postId);
    await deleteDoc(postRef);
  }

  async dislikePost(postId: string, userId: string) {
    const postRef = doc(this.firestore, 'posts', postId);
    const postSnap = await getDoc(postRef);
    if (postSnap.exists()) {
      const post = postSnap.data() as Post;
      const likes = post.likes || [];
      const dislikes = post.dislikes || [];
      const wasDisliked = dislikes.includes(userId);
      const wasLiked = likes.includes(userId);
      
      let updateData: any = {};
      
      if (wasDisliked) {
        updateData.dislikes = dislikes.filter(id => id !== userId);
      } else {
        // Remover de likes si estaba ahí
        const newLikes = wasLiked ? likes.filter(id => id !== userId) : likes;
        updateData.dislikes = [...dislikes, userId];
        if (wasLiked) {
          updateData.likes = newLikes;
        }
      }
      
      // Filtrar campos undefined
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });
      
      await updateDoc(postRef, updateData);
    }
  }

  async addComment(postId: string, comment: Omit<Comment, 'id' | 'createdAt' | 'likes' | 'dislikes'>, parentCommentIndex?: number) {
    const postRef = doc(this.firestore, 'posts', postId);
    const postSnap = await getDoc(postRef);
    
    if (!postSnap.exists()) {
      throw new Error('Post no encontrado');
    }
    
    const post = postSnap.data() as Post;
    const comments = [...(post.comments || [])];
    const newComment: Comment = {
      authorId: comment.authorId,
      authorName: comment.authorName,
      authorPhoto: comment.authorPhoto || null,
      content: comment.content,
      likes: [],
      dislikes: [],
      createdAt: Timestamp.now(),
      replies: [],
      parentId: parentCommentIndex !== undefined ? comments[parentCommentIndex]?.id : undefined
    };
    
    // Si es una respuesta, agregarla al comentario padre
    if (parentCommentIndex !== undefined && comments[parentCommentIndex]) {
      const parentComment = { ...comments[parentCommentIndex] };
      if (!parentComment.replies) {
        parentComment.replies = [];
      }
      parentComment.replies = [...parentComment.replies, newComment];
      comments[parentCommentIndex] = parentComment;
    } else {
      // Si es un comentario principal, agregarlo a la lista
      comments.push(newComment);
    }
    
    // Limpiar campos undefined y null
    const cleanComments = comments.map((item: any) => {
      const cleanItem: any = {};
      Object.keys(item).forEach(key => {
        if (item[key] !== undefined && item[key] !== null) {
          if (key === 'replies' && Array.isArray(item[key])) {
            cleanItem[key] = item[key].map((reply: any) => {
              const cleanReply: any = {};
              Object.keys(reply).forEach(replyKey => {
                if (reply[replyKey] !== undefined && reply[replyKey] !== null) {
                  cleanReply[replyKey] = reply[replyKey];
                }
              });
              return cleanReply;
            });
          } else {
            cleanItem[key] = item[key];
          }
        }
      });
      return cleanItem;
    });
    
    await updateDoc(postRef, {
      comments: cleanComments,
      updatedAt: Timestamp.now()
    });
    
    // Crear notificación solo si no es el propio autor
    // Envolver en try-catch para que si falla la notificación, no afecte la creación del comentario
    try {
      if (post.authorId !== comment.authorId) {
        const notificationUserId = parentCommentIndex !== undefined 
          ? comments[parentCommentIndex]?.authorId 
          : post.authorId;
        
        if (notificationUserId && notificationUserId !== comment.authorId) {
          await this.createNotification({
            userId: notificationUserId,
            type: parentCommentIndex !== undefined ? 'comment_reply' : 'comment',
            fromUserId: comment.authorId,
            fromUserName: comment.authorName,
            fromUserPhoto: comment.authorPhoto || null,
            postId: postId,
            read: false
          });
        }
      }
    } catch (notificationError) {
      // Si falla la notificación, solo loguear el error pero no lanzarlo
      // El comentario ya se agregó correctamente
      console.warn('Error creando notificación para comentario:', notificationError);
    }
  }

  async likeComment(postId: string, commentIndex: number, userId: string, replyIndex?: number) {
    const postRef = doc(this.firestore, 'posts', postId);
    const postSnap = await getDoc(postRef);
    if (postSnap.exists()) {
      const post = postSnap.data() as Post;
      const comments = [...(post.comments || [])];
      const comment = comments[commentIndex];
      if (comment) {
        // Si es una respuesta, modificar la respuesta específica
        if (replyIndex !== undefined && comment.replies && comment.replies[replyIndex]) {
          const reply = { ...comment.replies[replyIndex] };
          const likes = reply.likes || [];
          const dislikes = reply.dislikes || [];
          if (likes.includes(userId)) {
            reply.likes = likes.filter(id => id !== userId);
          } else {
            reply.likes = [...likes, userId];
            reply.dislikes = dislikes.filter(id => id !== userId);
          }
          comment.replies[replyIndex] = reply;
        } else {
          // Si es un comentario principal
          const likes = comment.likes || [];
          const dislikes = comment.dislikes || [];
          if (likes.includes(userId)) {
            comment.likes = likes.filter(id => id !== userId);
          } else {
            comment.likes = [...likes, userId];
            comment.dislikes = dislikes.filter(id => id !== userId);
          }
        }
        comments[commentIndex] = comment;
        await updateDoc(postRef, { comments, updatedAt: Timestamp.now() });
      }
    }
  }

  async dislikeComment(postId: string, commentIndex: number, userId: string, replyIndex?: number) {
    const postRef = doc(this.firestore, 'posts', postId);
    const postSnap = await getDoc(postRef);
    if (postSnap.exists()) {
      const post = postSnap.data() as Post;
      const comments = [...(post.comments || [])];
      const comment = comments[commentIndex];
      if (comment) {
        // Si es una respuesta, modificar la respuesta específica
        if (replyIndex !== undefined && comment.replies && comment.replies[replyIndex]) {
          const reply = { ...comment.replies[replyIndex] };
          const likes = reply.likes || [];
          const dislikes = reply.dislikes || [];
          if (dislikes.includes(userId)) {
            reply.dislikes = dislikes.filter(id => id !== userId);
          } else {
            reply.dislikes = [...dislikes, userId];
            reply.likes = likes.filter(id => id !== userId);
          }
          comment.replies[replyIndex] = reply;
        } else {
          // Si es un comentario principal
          const likes = comment.likes || [];
          const dislikes = comment.dislikes || [];
          if (dislikes.includes(userId)) {
            comment.dislikes = dislikes.filter(id => id !== userId);
          } else {
            comment.dislikes = [...dislikes, userId];
            comment.likes = likes.filter(id => id !== userId);
          }
        }
        comments[commentIndex] = comment;
        await updateDoc(postRef, { comments, updatedAt: Timestamp.now() });
      }
    }
  }

  // Tournament Methods
  async createTournament(tournament: Omit<Tournament, 'id' | 'createdAt' | 'teams' | 'status'>): Promise<string> {
    const tournamentsRef = collection(this.firestore, 'tournaments');
    const newTournament: Omit<Tournament, 'id'> = {
      ...tournament,
      teams: [],
      status: 'upcoming',
      createdAt: Timestamp.now(),
      grandFinalBestOf: tournament.grandFinalBestOf ?? 3,
      redemptionFinalBestOf: tournament.redemptionFinalBestOf ?? 3
    };
    const docRef = await addDoc(tournamentsRef, newTournament);
    return docRef.id;
  }

  getTournaments(): Observable<Tournament[]> {
    const tournamentsRef = collection(this.firestore, 'tournaments');
    const q = query(tournamentsRef, orderBy('createdAt', 'desc'));
    return from(getDocs(q)).pipe(
      map((snapshot: QuerySnapshot<DocumentData>) => snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Tournament)))
    );
  }

  getActiveTournament(): Observable<Tournament | null> {
    const tournamentsRef = collection(this.firestore, 'tournaments');
    const q = query(
      tournamentsRef,
      where('status', '==', 'ongoing'),
      limit(10)
    );
    return from(runInInjectionContext(this.injector, () => getDocs(q))).pipe(
      map((snapshot: QuerySnapshot<DocumentData>) => {
        if (snapshot.empty) return null;
        // Ordenar por createdAt en memoria
        const tournaments = snapshot.docs
          .map((doc: any) => ({ id: doc.id, ...doc.data() } as Tournament))
          .sort((a, b) => {
            const aTime = a.createdAt?.toMillis() || 0;
            const bTime = b.createdAt?.toMillis() || 0;
            return bTime - aTime; // Descendente
          });
        return tournaments[0] || null;
      })
    );
  }

  getAvailableTournaments(): Observable<Tournament[]> {
    const tournamentsRef = collection(this.firestore, 'tournaments');
    // Buscar torneos disponibles: upcoming, ongoing o confirmed
    // Usar solo where para evitar necesidad de índice compuesto, ordenar en memoria
    const q = query(
      tournamentsRef,
      where('status', 'in', ['upcoming', 'ongoing', 'confirmed']),
      limit(50) // Obtener más para filtrar y ordenar en memoria
    );
    return from(getDocs(q)).pipe(
      map((snapshot: QuerySnapshot<DocumentData>) => {
        const tournaments = snapshot.docs
          .map((doc: any) => ({ id: doc.id, ...doc.data() } as Tournament))
          .sort((a, b) => {
            const aTime = a.createdAt?.toMillis() || 0;
            const bTime = b.createdAt?.toMillis() || 0;
            return bTime - aTime; // Descendente (más recientes primero)
          });
        return tournaments;
      })
    );
  }

  hasAvailableTournaments(): Observable<boolean> {
    const tournamentsRef = collection(this.firestore, 'tournaments');
    const q = query(
      tournamentsRef,
      where('status', 'in', ['upcoming', 'ongoing', 'confirmed']),
      limit(1)
    );
    return new Observable<boolean>((observer) => {
      const unsubscribe = runInInjectionContext(this.injector, () =>
        onSnapshot(
          q,
          (snapshot) => observer.next(!snapshot.empty),
          (error) => {
            console.error('Error checking available tournaments:', error);
            observer.next(false);
          }
        )
      );
      return () => unsubscribe();
    });
  }

  async uploadTeamLogo(fileName: string, file: File): Promise<string> {
    const storageRef = ref(this.storage, fileName);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return url;
  }

  async registerTeam(tournamentId: string, team: Team) {
    const tournamentRef = doc(this.firestore, 'tournaments', tournamentId);
    const tournamentSnap = await getDoc(tournamentRef);
    if (tournamentSnap.exists()) {
      const tournament = tournamentSnap.data() as Tournament;
      const teams = tournament.teams || [];
      if (teams.length < tournament.maxTeams) {
        await updateDoc(tournamentRef, { 
          teams: [...teams, { ...team, registeredAt: Timestamp.now() }]
        });
      }
    }
  }

  async cancelRegistration(tournamentId: string, teamId: string) {
    const tournamentRef = doc(this.firestore, 'tournaments', tournamentId);
    const tournamentSnap = await getDoc(tournamentRef);
    if (tournamentSnap.exists()) {
      const tournament = tournamentSnap.data() as Tournament;
      const teams = (tournament.teams || []).filter(t => t.id !== teamId);
      await updateDoc(tournamentRef, { teams });
    }
  }

  // Search users by name or gameName
  searchUsers(searchTerm: string, limitCount: number = 20): Observable<UserProfile[]> {
    const usersRef = collection(this.firestore, 'users');
    // Firestore doesn't support full-text search, so we'll fetch all and filter client-side
    // For better performance, you could use Algolia or similar
    const q = query(usersRef, limit(limitCount * 5)); // Fetch more to filter
    return from(getDocs(q)).pipe(
      map((snapshot: QuerySnapshot<DocumentData>) => {
        const searchLower = searchTerm.toLowerCase();
        return snapshot.docs
          .map((doc: any) => ({ uid: doc.id, ...doc.data() } as UserProfile))
          .filter((user: UserProfile) => {
            const nameMatch = user.displayName?.toLowerCase().includes(searchLower);
            const gameNameMatch = user.gameName?.toLowerCase().includes(searchLower);
            return nameMatch || gameNameMatch;
          })
          .slice(0, limitCount);
      })
    );
  }

  getSuggestedUsers(currentUserId: string, limitCount: number = 6): Observable<UserProfile[]> {
    const usersRef = collection(this.firestore, 'users');
    const q = query(usersRef, limit(25));
    return from(getDocs(q)).pipe(
      map((snapshot: QuerySnapshot<DocumentData>) => {
        return snapshot.docs
          .map((docSnap: any) => ({ uid: docSnap.id, ...docSnap.data() } as UserProfile))
          .filter((u: UserProfile) => u.uid !== currentUserId)
          .slice(0, limitCount);
      })
    );
  }

  /** Lista de usuarios para explorar: 30 por página, paginación, prioridad a amigos en común */
  getExploreUsers(
    currentUserId: string,
    pageSize: number = 30,
    lastDoc?: unknown
  ): Observable<{ users: UserProfile[]; lastDoc: unknown; hasMore: boolean }> {
    const usersRef = collection(this.firestore, 'users');
    const batchSize = 80;
    const q = lastDoc
      ? query(usersRef, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(batchSize))
      : query(usersRef, orderBy('createdAt', 'desc'), limit(batchSize));
    return from(getDoc(doc(this.firestore, 'users', currentUserId))).pipe(
      map((currentSnap) => {
        const data = currentSnap.data();
        return {
          following: new Set((data?.['following'] as string[]) || []),
          followers: new Set((data?.['followers'] as string[]) || [])
        };
      }),
      switchMap(({ following, followers }) =>
        from(getDocs(q)).pipe(
          map((snapshot) => {
            const list = snapshot.docs
              .map((d) => ({ uid: d.id, ...d.data() } as UserProfile))
              .filter((u) => u.uid !== currentUserId)
              .map((u) => {
                const uFollow = new Set(u.following || []);
                const uFollowers = new Set(u.followers || []);
                let common = 0;
                following.forEach((id) => { if (uFollowers.has(id)) common++; });
                followers.forEach((id) => { if (uFollow.has(id)) common++; });
                return { ...u, _common: common };
              })
              .sort((a, b) => (b as any)._common - (a as any)._common)
              .slice(0, pageSize)
              .map(({ _common, ...u }) => u as UserProfile);
            const last = snapshot.docs[snapshot.docs.length - 1];
            const hasMore = snapshot.docs.length >= batchSize && !!last;
            return { users: list, lastDoc: last ?? null, hasMore };
          })
        )
      )
    );
  }

  // Get tournament by ID
  getTournamentById(tournamentId: string): Observable<Tournament | null> {
    const tournamentRef = doc(this.firestore, 'tournaments', tournamentId);
    return from(getDoc(tournamentRef)).pipe(
      map((docSnap: any) => {
        if (docSnap.exists()) {
          return { id: docSnap.id, ...docSnap.data() } as Tournament;
        }
        return null;
      })
    );
  }

  /** Torneos finalizados (historial) */
  getFinishedTournaments(): Observable<Tournament[]> {
    const tournamentsRef = collection(this.firestore, 'tournaments');
    const q = query(tournamentsRef, where('status', '==', 'finished'), limit(100));
    return from(getDocs(q)).pipe(
      map((snapshot: QuerySnapshot<DocumentData>) => {
        const list = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Tournament));
        return list.sort((a, b) => {
          const ta = a.finishedAt?.toMillis?.() ?? a.endDate?.toMillis?.() ?? 0;
          const tb = b.finishedAt?.toMillis?.() ?? b.endDate?.toMillis?.() ?? 0;
          return tb - ta;
        });
      })
    );
  }

  /** Suma 1 torneo ganado al equipo campeón (documento teamTournamentStats/{teamId}) */
  async incrementTeamTournamentWins(teamId: string, teamName: string): Promise<void> {
    const ref = doc(this.firestore, 'teamTournamentStats', teamId);
    await setDoc(
      ref,
      {
        teamId,
        teamName,
        tournamentsWon: increment(1),
        updatedAt: Timestamp.now()
      } as any,
      { merge: true }
    );
  }

  getTeamTournamentStats(teamId: string): Observable<TeamTournamentStats | null> {
    const ref = doc(this.firestore, 'teamTournamentStats', teamId);
    return from(getDoc(ref)).pipe(
      map(snap => {
        if (!snap.exists()) return null;
        const d = snap.data() as Partial<TeamTournamentStats>;
        return {
          teamId: snap.id,
          teamName: d.teamName ?? '',
          tournamentsWon: d.tournamentsWon ?? 0,
          updatedAt: d.updatedAt ?? Timestamp.now()
        } as TeamTournamentStats;
      })
    );
  }

  // Update tournament
  async updateTournament(tournamentId: string, updates: Partial<Tournament>): Promise<void> {
    const tournamentRef = doc(this.firestore, 'tournaments', tournamentId);
    await updateDoc(tournamentRef, updates);
  }

  // Delete tournament
  async deleteTournament(tournamentId: string): Promise<void> {
    const tournamentRef = doc(this.firestore, 'tournaments', tournamentId);
    await deleteDoc(tournamentRef);
  }

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

  private resolveBracketByes(matches: BracketMatch[]): BracketMatch[] {
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

  private generateDoubleEliminationBracket(
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

  private getRoundTypeByParticipants(participants: number): 'round16' | 'quarter' | 'semi' | 'final' {
    if (participants <= 2) return 'final';
    if (participants === 4) return 'semi';
    if (participants === 8) return 'quarter';
    return 'round16';
  }

  private getRoundLabelByParticipants(participants: number): string {
    if (participants <= 2) return 'Final';
    if (participants === 4) return 'Semifinal';
    if (participants === 8) return 'Cuartos';
    if (participants === 16) return 'Octavos';
    return 'Ronda';
  }

  // Helper function para obtener los IDs de usuario ordenados para una conversación
  private getConversationUserIds(userId1: string, userId2: string): { user1Id: string; user2Id: string } {
    const ids = [userId1, userId2].sort();
    return { user1Id: ids[0], user2Id: ids[1] };
  }

  // Helper function para obtener el ID del documento de conversación
  private getConversationId(userId1: string, userId2: string): string {
    const { user1Id, user2Id } = this.getConversationUserIds(userId1, userId2);
    return `${user1Id}_${user2Id}`;
  }

  // Messages Methods - Reestructurado para usar conversaciones
  async sendMessage(message: Omit<Message, 'id' | 'timestamp' | 'read' | 'fromName' | 'fromPhoto'>) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');
    
    // Validar que fromId y toId estén presentes
    if (!message.fromId || !message.toId) {
      throw new Error('fromId y toId son requeridos');
    }
    
    // Validar que no se envíe un mensaje a sí mismo
    if (message.fromId === message.toId) {
      throw new Error('No puedes enviarte un mensaje a ti mismo');
    }
    
    const profile = await this.getUserProfile(user.uid);
    
    // Asegurar que fromId sea el ID del usuario autenticado
    const fromId = user.uid;
    
    const newMessage: Omit<Message, 'id'> = {
      fromId: fromId,
      toId: message.toId,
      content: message.content,
      fromName: profile?.displayName || 'Usuario',
      fromPhoto: profile?.photoURL || undefined,
      timestamp: Timestamp.now(),
      read: false
    };
    
    console.log('Enviando mensaje:', newMessage);
    
    // Obtener IDs ordenados para la conversación
    const { user1Id, user2Id } = this.getConversationUserIds(fromId, message.toId);
    const conversationId = this.getConversationId(fromId, message.toId);
    const conversationRef = doc(this.firestore, 'conversations', conversationId);
    
    // Verificar si la conversación ya existe
    const conversationSnap = await getDoc(conversationRef);
    const now = Timestamp.now();
    
    if (conversationSnap.exists()) {
      // Actualizar conversación existente
      const conversation = conversationSnap.data() as Conversation;
      const updatedMessages = [...(conversation.messages || []), newMessage];
      
      await updateDoc(conversationRef, {
        messages: updatedMessages,
        lastMessage: newMessage,
        lastMessageTime: newMessage.timestamp,
        updatedAt: now
      });
    } else {
      // Crear nueva conversación
      const newConversation: Conversation = {
        user1Id,
        user2Id,
        messages: [newMessage],
        lastMessage: newMessage,
        lastMessageTime: newMessage.timestamp,
        createdAt: now,
        updatedAt: now
      };
      
      await setDoc(conversationRef, newConversation);
    }
    
    // Crear notificación de mensaje
    try {
      await this.createNotification({
        userId: message.toId,
        type: 'message',
        fromUserId: fromId,
        fromUserName: profile?.displayName || 'Usuario',
        fromUserPhoto: profile?.photoURL || undefined,
        message: message.content,
        read: false
      });
    } catch (error) {
      console.error('Error creando notificación de mensaje:', error);
      // No lanzar error si falla la notificación, el mensaje ya se envió
    }
  }

  getMessages(userId1: string, userId2: string): Observable<Message[]> {
    const conversationId = this.getConversationId(userId1, userId2);
    const conversationRef = doc(this.firestore, 'conversations', conversationId);
    
    return new Observable(observer => {
      const unsubscribe = onSnapshot(
        conversationRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const conversation = snapshot.data() as Conversation;
            // Ordenar mensajes por timestamp ascendente (cascada)
            const sortedMessages = (conversation.messages || []).sort((a, b) => {
              const aTime = a.timestamp?.toMillis() || 0;
              const bTime = b.timestamp?.toMillis() || 0;
              return aTime - bTime; // Ascendente: más antiguo primero
            });
            observer.next(sortedMessages);
          } else {
            // Si no existe la conversación, devolver array vacío
            observer.next([]);
          }
        },
        (error) => {
          console.error('Error obteniendo mensajes:', error);
          observer.next([]);
        }
      );
      
      return () => {
        unsubscribe();
      };
    });
  }

  getConversations(userId: string): Observable<string[]> {
    const conversationsRef = collection(this.firestore, 'conversations');
    
    return new Observable(observer => {
      let unsubscribe1: (() => void) | undefined;
      let unsubscribe2: (() => void) | undefined;
      let conversations1: Conversation[] = [];
      let conversations2: Conversation[] = [];
      
      const updateConversations = () => {
        const allConversations = [...conversations1, ...conversations2];
        const uniqueUserIds = new Set<string>();
        
        allConversations.forEach((conv: Conversation) => {
          // Determinar cuál es el otro usuario en la conversación
          if (conv.user1Id === userId) {
            uniqueUserIds.add(conv.user2Id);
          } else if (conv.user2Id === userId) {
            uniqueUserIds.add(conv.user1Id);
          }
        });
        
        // Ordenar por último mensaje (más reciente primero)
        const sortedUserIds = Array.from(uniqueUserIds).sort((a, b) => {
          const convA = allConversations.find(c => 
            (c.user1Id === userId && c.user2Id === a) || (c.user2Id === userId && c.user1Id === a)
          );
          const convB = allConversations.find(c => 
            (c.user1Id === userId && c.user2Id === b) || (c.user2Id === userId && c.user1Id === b)
          );
          
          const timeA = convA?.lastMessageTime?.toMillis() || 0;
          const timeB = convB?.lastMessageTime?.toMillis() || 0;
          return timeB - timeA; // Descendente: más reciente primero
        });
        
        console.log('Conversaciones únicas encontradas:', sortedUserIds);
        observer.next(sortedUserIds);
      };
      
      // Query para conversaciones donde el usuario es user1Id
      try {
        const q1 = query(
          conversationsRef,
          where('user1Id', '==', userId)
        );
        
        unsubscribe1 = onSnapshot(q1, 
          (snapshot: QuerySnapshot<DocumentData>) => {
            conversations1 = snapshot.docs.map((doc: any) => ({ 
              id: doc.id, 
              ...doc.data() 
            } as Conversation));
            updateConversations();
          },
          error => {
            console.error('Error en query de conversaciones user1Id:', error);
          }
        );
      } catch (error) {
        console.error('Error creando query de conversaciones user1Id:', error);
      }
      
      // Query para conversaciones donde el usuario es user2Id
      try {
        const q2 = query(
          conversationsRef,
          where('user2Id', '==', userId)
        );
        
        unsubscribe2 = onSnapshot(q2, 
          (snapshot: QuerySnapshot<DocumentData>) => {
            conversations2 = snapshot.docs.map((doc: any) => ({ 
              id: doc.id,
              ...doc.data() 
            } as Conversation));
            updateConversations();
          },
          error => {
            console.error('Error en query de conversaciones user2Id:', error);
          }
        );
      } catch (error) {
        console.error('Error creando query de conversaciones user2Id:', error);
      }
      
      return () => {
        if (unsubscribe1) unsubscribe1();
        if (unsubscribe2) unsubscribe2();
      };
    });
  }

  async markAsRead(userId1: string, userId2: string, messageIndex: number): Promise<void> {
    const conversationId = this.getConversationId(userId1, userId2);
    const conversationRef = doc(this.firestore, 'conversations', conversationId);
    
    const conversationSnap = await getDoc(conversationRef);
    if (!conversationSnap.exists()) {
      throw new Error('Conversación no encontrada');
    }
    
    const conversation = conversationSnap.data() as Conversation;
    const messages = [...(conversation.messages || [])];
    
    // Buscar el mensaje que necesita ser marcado como leído (debe ser para el usuario actual)
    if (messages[messageIndex] && messages[messageIndex].toId === userId1) {
      messages[messageIndex] = { ...messages[messageIndex], read: true };
      
      await updateDoc(conversationRef, {
        messages: messages,
        updatedAt: Timestamp.now()
      });
    }
  }

  async deleteMessage(userId1: string, userId2: string): Promise<void> {
    const conversationId = this.getConversationId(userId1, userId2);
    const conversationRef = doc(this.firestore, 'conversations', conversationId);
    
    // Eliminar toda la conversación
    await deleteDoc(conversationRef);
  }

  // Storage Methods
  async uploadImage(file: File, path: string): Promise<string> {
    try {
      const storageRef = ref(this.storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      return url;
    } catch (error: any) {
      console.error('Error uploading image:', error);
      throw new Error('Error al subir la imagen. Por favor intenta nuevamente.');
    }
  }

  async uploadVideo(file: File, path: string): Promise<string> {
    try {
      const storageRef = ref(this.storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      return url;
    } catch (error: any) {
      console.error('Error uploading video:', error);
      throw new Error('Error al subir el video. Por favor intenta nuevamente.');
    }
  }

  // Follow/Unfollow
  async followUser(currentUserId: string, targetUserId: string) {
    if (currentUserId === targetUserId) {
      throw new Error('No puedes seguirte a ti mismo');
    }

    const currentUserRef = doc(this.firestore, 'users', currentUserId);
    const targetUserRef = doc(this.firestore, 'users', targetUserId);
    
    const currentUser = await this.getUserProfile(currentUserId);
    const targetUser = await this.getUserProfile(targetUserId);
    
    if (!currentUser) {
      throw new Error('Usuario actual no encontrado');
    }
    
    if (!targetUser) {
      throw new Error('Usuario objetivo no encontrado');
    }
    
    const following = currentUser.following || [];
    const followers = targetUser.followers || [];
    
    if (!following.includes(targetUserId)) {
      // Actualizar following del usuario actual
      await updateDoc(currentUserRef, { following: [...following, targetUserId] });
      
      // Actualizar followers del usuario objetivo
      if (!followers.includes(currentUserId)) {
        await updateDoc(targetUserRef, { followers: [...followers, currentUserId] });
      }
      
      // Crear notificación de seguimiento (envolver en try-catch para que no falle si hay error)
      try {
        await this.createNotification({
          userId: targetUserId,
          type: 'follow',
          fromUserId: currentUserId,
          fromUserName: currentUser.displayName,
          fromUserPhoto: currentUser.photoURL || null,
          read: false
        });
      } catch (notificationError) {
        // Si falla la notificación, solo loguear el error pero no lanzarlo
        // El seguimiento ya se actualizó correctamente
        console.warn('Error creando notificación de seguimiento:', notificationError);
      }
    }
  }

  async unfollowUser(currentUserId: string, targetUserId: string) {
    if (currentUserId === targetUserId) {
      throw new Error('No puedes dejar de seguirte a ti mismo');
    }

    const currentUserRef = doc(this.firestore, 'users', currentUserId);
    const targetUserRef = doc(this.firestore, 'users', targetUserId);
    
    const currentUser = await this.getUserProfile(currentUserId);
    const targetUser = await this.getUserProfile(targetUserId);
    
    if (!currentUser) {
      throw new Error('Usuario actual no encontrado');
    }
    
    if (!targetUser) {
      throw new Error('Usuario objetivo no encontrado');
    }
    
    const following = (currentUser.following || []).filter(id => id !== targetUserId);
    const followers = (targetUser.followers || []).filter(id => id !== currentUserId);
    
    await updateDoc(currentUserRef, { following });
    await updateDoc(targetUserRef, { followers });
  }

  getUserPosts(userId: string): Observable<Post[]> {
    const postsRef = collection(this.firestore, 'posts');
    const q = query(postsRef, where('authorId', '==', userId));
    return runInInjectionContext(this.injector, () => collectionSnapshots(q)).pipe(
      map((docs) => {
        // Ordenar por createdAt en memoria
        return docs
          .map((doc: any) => ({ id: doc.id, ...doc.data() } as Post))
          .sort((a, b) => {
            const aTime = a.createdAt?.toMillis() || 0;
            const bTime = b.createdAt?.toMillis() || 0;
            return bTime - aTime; // Descendente
          });
      })
    );
  }

  // News Methods
  async createNews(news: Omit<News, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const newsRef = collection(this.firestore, 'news');
    const newNews: Omit<News, 'id'> = {
      ...news,
      published: news.published || false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    const docRef = await addDoc(newsRef, newNews);
    return docRef.id;
  }

  getNews(limitCount: number = 50): Observable<News[]> {
    const newsRef = collection(this.firestore, 'news');
    // Usar solo where para evitar necesidad de índice compuesto, ordenar en el cliente
    const q = query(newsRef, where('published', '==', true), limit(limitCount * 2)); // Traer más para ordenar
    return from(getDocs(q)).pipe(
      map((snapshot: QuerySnapshot<DocumentData>) => {
        const news = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as News));
        // Ordenar por fecha de creación descendente en el cliente
        return news.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        }).slice(0, limitCount);
      })
    );
  }

  getAllNews(limitCount: number = 100): Observable<News[]> {
    const newsRef = collection(this.firestore, 'news');
    // Ordenar por createdAt descendente (requiere índice simple, no compuesto)
    const q = query(newsRef, orderBy('createdAt', 'desc'), limit(limitCount));
    return from(getDocs(q)).pipe(
      map((snapshot: QuerySnapshot<DocumentData>) => snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as News)))
    );
  }

  getNewsById(newsId: string): Observable<News | null> {
    const newsRef = doc(this.firestore, 'news', newsId);
    return from(getDoc(newsRef)).pipe(
      map((docSnap: any) => docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as News : null)
    );
  }

  async updateNews(newsId: string, updates: Partial<Omit<News, 'id' | 'createdAt'>>): Promise<void> {
    const newsRef = doc(this.firestore, 'news', newsId);
    await updateDoc(newsRef, {
      ...updates,
      updatedAt: Timestamp.now()
    });
  }

  async deleteNews(newsId: string): Promise<void> {
    const newsRef = doc(this.firestore, 'news', newsId);
    await deleteDoc(newsRef);
  }

  // Contact Messages Methods
  async createContactMessage(message: Omit<ContactMessage, 'id' | 'createdAt' | 'read'>): Promise<string> {
    const messagesRef = collection(this.firestore, 'contactMessages');
    const newMessage: Omit<ContactMessage, 'id'> = {
      ...message,
      read: false,
      createdAt: Timestamp.now()
    };
    const docRef = await addDoc(messagesRef, newMessage);
    return docRef.id;
  }

  getContactMessages(limitCount: number = 100): Observable<ContactMessage[]> {
    const messagesRef = collection(this.firestore, 'contactMessages');
    const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(limitCount));
    return from(getDocs(q)).pipe(
      map((snapshot: QuerySnapshot<DocumentData>) => snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as ContactMessage)))
    );
  }

  async getAdminEmails(): Promise<string[]> {
    const usersRef = collection(this.firestore, 'users');
    const q = query(usersRef, where('role', '==', 'admin'));
    const querySnapshot = await getDocs(q);
    const emails: string[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as UserProfile;
      if (data.email) {
        emails.push(data.email);
      }
    });
    return emails;
  }

  // Notification Methods
  async createNotification(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<string> {
    const notificationsRef = collection(this.firestore, 'notifications');
    const newNotification: Omit<Notification, 'id'> = {
      ...notification,
      createdAt: Timestamp.now()
    };
    const docRef = await addDoc(notificationsRef, newNotification);
    
    // No intentar limpiar notificaciones antiguas aquí porque:
    // 1. Solo el usuario propietario puede eliminar sus propias notificaciones (reglas de Firestore)
    // 2. Si creamos una notificación para otro usuario, no tenemos permisos para eliminar las suyas
    // La limpieza de notificaciones antiguas debe hacerse desde el lado del cliente cuando el usuario las ve
    // o mediante una Cloud Function con permisos de administrador
    
    return docRef.id;
  }

  getNotifications(userId: string): Observable<Notification[]> {
    const notificationsRef = collection(this.firestore, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    return runInInjectionContext(this.injector, () => collectionSnapshots(q)).pipe(
      map((docs) => {
        return docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Notification));
      })
    );
  }

  getUnreadNotificationsCount(userId: string): Observable<number> {
    const notificationsRef = collection(this.firestore, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      where('read', '==', false)
    );
    return runInInjectionContext(this.injector, () => collectionSnapshots(q)).pipe(
      map((docs) => docs.length)
    );
  }

  async markNotificationAsRead(notificationId: string): Promise<void> {
    const notificationRef = doc(this.firestore, 'notifications', notificationId);
    await updateDoc(notificationRef, { read: true });
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    const notificationsRef = collection(this.firestore, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      where('read', '==', false)
    );
    const querySnapshot = await getDocs(q);
    const updatePromises = querySnapshot.docs.map((doc: any) => 
      updateDoc(doc.ref, { read: true })
    );
    await Promise.all(updatePromises);
  }

  // Obtener el total de mensajes no leídos para un usuario
  getUnreadMessagesCount(userId: string): Observable<number> {
    const conversationsRef = collection(this.firestore, 'conversations');
    
    return new Observable(observer => {
      let unsubscribe1: (() => void) | undefined;
      let unsubscribe2: (() => void) | undefined;
      let conversations1: Conversation[] = [];
      let conversations2: Conversation[] = [];
      
      const updateCount = () => {
        const allConversations = [...conversations1, ...conversations2];
        let totalUnread = 0;
        
        allConversations.forEach((conv: Conversation) => {
          // Contar mensajes no leídos donde el usuario es el destinatario
          const unreadMessages = (conv.messages || []).filter(m => 
            !m.read && m.toId === userId
          );
          totalUnread += unreadMessages.length;
        });
        
        observer.next(totalUnread);
      };
      
      // Query para conversaciones donde el usuario es user1Id
      try {
        const q1 = query(
          conversationsRef,
          where('user1Id', '==', userId)
        );
        
        unsubscribe1 = runInInjectionContext(this.injector, () => onSnapshot(q1, 
          (snapshot: QuerySnapshot<DocumentData>) => {
            conversations1 = snapshot.docs.map((doc: any) => ({ 
              id: doc.id, 
              ...doc.data() 
            } as Conversation));
            updateCount();
          },
          error => {
            console.error('Error en query de conversaciones user1Id:', error);
          }
        ));
      } catch (error) {
        console.error('Error creando query de conversaciones user1Id:', error);
      }
      
      // Query para conversaciones donde el usuario es user2Id
      try {
        const q2 = query(
          conversationsRef,
          where('user2Id', '==', userId)
        );
        
        unsubscribe2 = runInInjectionContext(this.injector, () => onSnapshot(q2, 
          (snapshot: QuerySnapshot<DocumentData>) => {
            conversations2 = snapshot.docs.map((doc: any) => ({ 
              id: doc.id,
              ...doc.data() 
            } as Conversation));
            updateCount();
          },
          error => {
            console.error('Error en query de conversaciones user2Id:', error);
          }
        ));
      } catch (error) {
        console.error('Error creando query de conversaciones user2Id:', error);
      }
      
      return () => {
        if (unsubscribe1) unsubscribe1();
        if (unsubscribe2) unsubscribe2();
      };
    });
  }

  // Iniciar sistema de actualización automática de nombres/tags de invocadores
  startSummonerNameUpdateSystem() {
    // Verificar cada 5 minutos
    const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutos
    
    // Verificar inmediatamente al iniciar (después de un pequeño delay)
    setTimeout(() => {
      this.checkAndUpdateSummonerNames();
    }, 10000); // Esperar 10 segundos después de cargar la app
    
    // Configurar intervalo periódico
    if (this.summonerUpdateInterval) {
      clearInterval(this.summonerUpdateInterval);
    }
    
    this.summonerUpdateInterval = setInterval(() => {
      this.checkAndUpdateSummonerNames();
    }, CHECK_INTERVAL);
  }

  // Detener sistema de actualización
  stopSummonerNameUpdateSystem() {
    if (this.summonerUpdateInterval) {
      clearInterval(this.summonerUpdateInterval);
      this.summonerUpdateInterval = null;
    }
  }

  // Verificar y actualizar nombres/tags de todos los usuarios con PUUID
  async checkAndUpdateSummonerNames() {
    try {
      // Obtener usuarios conectados actualmente y los que tienen PUUID verificado
      // Verificamos solo usuarios activos para no sobrecargar la API
      const currentUser = this.getCurrentUser();
      
      // Verificar el usuario actual si está autenticado
      if (currentUser) {
        await this.checkAndUpdateUserSummonerName(currentUser.uid);
      }
      
      // También verificar usuarios que están viendo perfiles (opcional, para mejorar UX)
      // Por ahora solo verificamos el usuario actual para evitar demasiadas llamadas a la API
    } catch (error) {
      console.error('Error en checkAndUpdateSummonerNames:', error);
    }
  }

  // Verificar y actualizar el nombre/tag de un usuario específico
  async checkAndUpdateUserSummonerName(uid: string): Promise<boolean> {
    try {
      const userProfile = await this.getUserProfile(uid);
      
      if (!userProfile || !userProfile.puuid || !userProfile.region) {
        return false;
      }
      
      // Obtener datos actuales del invocador
      return new Promise((resolve) => {
        this.riotApiService.getAccountByPuuid(userProfile.region!, userProfile.puuid!).subscribe({
          next: async (accountData) => {
            // Verificar si el nombre o tag han cambiado
            if (accountData.gameName !== userProfile.gameName || accountData.tagLine !== userProfile.tagLine) {
              // Actualizar el perfil
              await this.updateUserProfile(uid, {
                gameName: accountData.gameName,
                tagLine: accountData.tagLine,
                displayName: accountData.gameName
              });
              
              // Actualizar también en Auth si es el usuario actual
              const currentUser = this.getCurrentUser();
              if (currentUser && currentUser.uid === uid) {
                await updateProfile(currentUser, { displayName: accountData.gameName });
              }
              
              resolve(true);
            } else {
              resolve(false);
            }
          },
          error: (error) => {
            const msg = error?.error?.error || error?.message || error?.statusText || 'Servicio no disponible';
            console.warn(`Error verificando summoner para usuario ${uid}:`, msg, error?.status === 503 ? '(Revisa la API key de Riot en Firebase)' : '');
            resolve(false);
          }
        });
      });
    } catch (error) {
      console.error(`Error en checkAndUpdateUserSummonerName para ${uid}:`, error);
      return false;
    }
  }

}


