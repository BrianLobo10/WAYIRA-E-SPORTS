import { Injectable, inject } from '@angular/core';
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
  getDocs,
  addDoc,
  Timestamp,
  onSnapshot,
  QuerySnapshot,
  DocumentData
} from '@angular/fire/firestore';
import { 
  Auth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  updateProfile
} from '@angular/fire/auth';
import { 
  Storage, 
  ref, 
  uploadBytes, 
  getDownloadURL,
  deleteObject 
} from '@angular/fire/storage';
import { Observable, from, map, BehaviorSubject } from 'rxjs';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: 'user' | 'admin';
  gameName?: string;
  tagLine?: string;
  region?: string;
  puuid?: string;
  followers?: string[];
  following?: string[];
  createdAt: Timestamp;
  bio?: string;
}

export interface Post {
  id?: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  content: string;
  images?: string[];
  video?: string;
  likes: string[];
  comments: Comment[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Comment {
  id?: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  content: string;
  likes: string[];
  dislikes: string[];
  createdAt: Timestamp;
}

export interface Tournament {
  id?: string;
  name: string;
  description: string;
  startDate: Timestamp;
  endDate: Timestamp;
  maxTeams: number;
  teams: Team[];
  status: 'upcoming' | 'ongoing' | 'finished';
  createdBy: string;
  createdAt: Timestamp;
  bracket?: BracketMatch[];
}

export interface Team {
  id: string;
  name: string;
  captainId: string;
  captainName: string;
  players: string[]; // User IDs
  substitutes: string[]; // User IDs
  registeredAt: Timestamp;
}

export interface BracketMatch {
  id: string;
  round: 'round16' | 'quarter' | 'semi' | 'final';
  team1Id?: string;
  team1Name?: string;
  team2Id?: string;
  team2Name?: string;
  score1?: number;
  score2?: number;
  winnerId?: string;
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

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private storage = inject(Storage);
  
  private currentUser$ = new BehaviorSubject<User | null>(null);
  public currentUser = this.currentUser$.asObservable();

  constructor() {
    onAuthStateChanged(this.auth, (user: User | null) => {
      this.currentUser$.next(user);
    });
  }

  // Auth Methods
  async registerWithRiot(gameName: string, tagLine: string, region: string, puuid: string, password: string) {
    // Generar email único basado en puuid
    const email = `${puuid}@riot.wayira.local`;
    
    // Verificar si el usuario ya existe por puuid
    const existingUser = await this.findUserByPuuid(puuid);
    if (existingUser) {
      throw new Error('Esta cuenta de Riot Games ya está registrada');
    }

    const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
    const user = userCredential.user;
    
    const userProfile: UserProfile = {
      uid: user.uid,
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

    await setDoc(doc(this.firestore, 'users', user.uid), userProfile);
    await updateProfile(user, { displayName: gameName });
    
    return user;
  }

  async loginWithRiot(gameName: string, tagLine: string, region: string, puuid: string, password: string, rememberMe: boolean = false) {
    // Buscar usuario por puuid en Firestore
    const userProfile = await this.findUserByPuuid(puuid);
    
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

    // El email está en el formato puuid@riot.wayira.local
    const email = `${puuid}@riot.wayira.local`;
    
    // Configurar persistencia de sesión
    const { setPersistence, browserLocalPersistence, browserSessionPersistence } = await import('firebase/auth');
    const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(this.auth, persistence);
    
    // Intentar iniciar sesión con la contraseña proporcionada
    try {
      return await signInWithEmailAndPassword(this.auth, email, password);
    } catch (error: any) {
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        throw new Error('Contraseña incorrecta. Verifica tus credenciales.');
      }
      throw new Error('Error al iniciar sesión. Por favor intenta nuevamente.');
    }
  }

  private async findUserByPuuid(puuid: string): Promise<UserProfile | null> {
    const usersRef = collection(this.firestore, 'users');
    const q = query(usersRef, where('puuid', '==', puuid), limit(1));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const docSnap = querySnapshot.docs[0];
    const data: any = docSnap.data();
    return {
      id: docSnap.id,
      uid: data['uid'] || docSnap.id,
      email: data['email'] || '',
      displayName: data['displayName'] || '',
      role: data['role'] || 'user',
      gameName: data['gameName'],
      tagLine: data['tagLine'],
      region: data['region'],
      puuid: data['puuid'],
      photoURL: data['photoURL'],
      bio: data['bio'],
      followers: data['followers'] || [],
      following: data['following'] || [],
      createdAt: data['createdAt'] || Timestamp.now()
    } as UserProfile;
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

  async logout() {
    return await signOut(this.auth);
  }

  getCurrentUser(): User | null {
    // Use the BehaviorSubject value for immediate synchronous access
    // This is more reliable than auth.currentUser which can be null during initialization
    return this.currentUser$.value;
  }

  // User Profile Methods
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    const docRef = doc(this.firestore, 'users', uid);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() as UserProfile : null;
  }

  async updateUserProfile(uid: string, data: Partial<UserProfile>) {
    const docRef = doc(this.firestore, 'users', uid);
    return await updateDoc(docRef, { ...data, updatedAt: Timestamp.now() });
  }

  async isAdmin(uid: string): Promise<boolean> {
    const profile = await this.getUserProfile(uid);
    return profile?.role === 'admin';
  }

  // Posts Methods
  async createPost(post: Omit<Post, 'id' | 'createdAt' | 'updatedAt' | 'likes' | 'comments'>): Promise<string> {
    const postsRef = collection(this.firestore, 'posts');
    const newPost: Omit<Post, 'id'> = {
      ...post,
      likes: [],
      comments: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    const docRef = await addDoc(postsRef, newPost);
    return docRef.id;
  }

  getPosts(limitCount: number = 20): Observable<Post[]> {
    const postsRef = collection(this.firestore, 'posts');
    const q = query(postsRef, orderBy('createdAt', 'desc'), limit(limitCount));
    return from(getDocs(q)).pipe(
      map((snapshot: QuerySnapshot<DocumentData>) => snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Post)))
    );
  }

  getPostById(postId: string): Observable<Post | null> {
    const postRef = doc(this.firestore, 'posts', postId);
    return from(getDoc(postRef)).pipe(
      map((docSnap: any) => docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Post : null)
    );
  }

  async likePost(postId: string, userId: string) {
    const postRef = doc(this.firestore, 'posts', postId);
    const postSnap = await getDoc(postRef);
    if (postSnap.exists()) {
      const post = postSnap.data() as Post;
      const likes = post.likes || [];
      if (likes.includes(userId)) {
        await updateDoc(postRef, { likes: likes.filter(id => id !== userId) });
      } else {
        await updateDoc(postRef, { likes: [...likes, userId] });
      }
    }
  }

  async addComment(postId: string, comment: Omit<Comment, 'id' | 'createdAt' | 'likes' | 'dislikes'>) {
    const postRef = doc(this.firestore, 'posts', postId);
    const postSnap = await getDoc(postRef);
    if (postSnap.exists()) {
      const post = postSnap.data() as Post;
      const comments = post.comments || [];
      const newComment: Comment = {
        ...comment,
        likes: [],
        dislikes: [],
        createdAt: Timestamp.now()
      };
      await updateDoc(postRef, { 
        comments: [...comments, newComment],
        updatedAt: Timestamp.now()
      });
    }
  }

  async likeComment(postId: string, commentIndex: number, userId: string) {
    const postRef = doc(this.firestore, 'posts', postId);
    const postSnap = await getDoc(postRef);
    if (postSnap.exists()) {
      const post = postSnap.data() as Post;
      const comments = [...(post.comments || [])];
      const comment = comments[commentIndex];
      if (comment) {
        const likes = comment.likes || [];
        const dislikes = comment.dislikes || [];
        if (likes.includes(userId)) {
          comment.likes = likes.filter(id => id !== userId);
        } else {
          comment.likes = [...likes, userId];
          comment.dislikes = dislikes.filter(id => id !== userId);
        }
        comments[commentIndex] = comment;
        await updateDoc(postRef, { comments, updatedAt: Timestamp.now() });
      }
    }
  }

  async dislikeComment(postId: string, commentIndex: number, userId: string) {
    const postRef = doc(this.firestore, 'posts', postId);
    const postSnap = await getDoc(postRef);
    if (postSnap.exists()) {
      const post = postSnap.data() as Post;
      const comments = [...(post.comments || [])];
      const comment = comments[commentIndex];
      if (comment) {
        const likes = comment.likes || [];
        const dislikes = comment.dislikes || [];
        if (dislikes.includes(userId)) {
          comment.dislikes = dislikes.filter(id => id !== userId);
        } else {
          comment.dislikes = [...dislikes, userId];
          comment.likes = likes.filter(id => id !== userId);
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
      createdAt: Timestamp.now()
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

  // Messages Methods
  async sendMessage(message: Omit<Message, 'id' | 'timestamp' | 'read' | 'fromName' | 'fromPhoto'>) {
    const messagesRef = collection(this.firestore, 'messages');
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');
    
    const profile = await this.getUserProfile(user.uid);
    const newMessage: Omit<Message, 'id'> = {
      ...message,
      fromName: profile?.displayName || 'Usuario',
      fromPhoto: profile?.photoURL,
      timestamp: Timestamp.now(),
      read: false
    };
    return await addDoc(messagesRef, newMessage);
  }

  getMessages(userId1: string, userId2: string): Observable<Message[]> {
    const messagesRef = collection(this.firestore, 'messages');
    const q = query(
      messagesRef,
      where('fromId', 'in', [userId1, userId2]),
      where('toId', 'in', [userId1, userId2]),
      orderBy('timestamp', 'asc')
    );
    return from(getDocs(q)).pipe(
      map((snapshot: QuerySnapshot<DocumentData>) => snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Message)))
    );
  }

  getConversations(userId: string): Observable<string[]> {
    const messagesRef = collection(this.firestore, 'messages');
    const q1 = query(
      messagesRef,
      where('toId', '==', userId),
      orderBy('timestamp', 'desc')
    );
    const q2 = query(
      messagesRef,
      where('fromId', '==', userId),
      orderBy('timestamp', 'desc')
    );
    
    return from(Promise.all([getDocs(q1), getDocs(q2)])).pipe(
      map(([snapshot1, snapshot2]: [QuerySnapshot<DocumentData>, QuerySnapshot<DocumentData>]) => {
        const messages1 = snapshot1.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Message));
        const messages2 = snapshot2.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Message));
        const allMessages = [...messages1, ...messages2];
        const uniqueUserIds = new Set<string>();
        allMessages.forEach((m: Message) => {
          if (m.fromId === userId) {
            uniqueUserIds.add(m.toId);
          } else {
            uniqueUserIds.add(m.fromId);
          }
        });
        return Array.from(uniqueUserIds);
      })
    );
  }

  async markAsRead(messageId: string) {
    const messageRef = doc(this.firestore, 'messages', messageId);
    await updateDoc(messageRef, { read: true });
  }

  // Storage Methods
  async uploadImage(file: File, path: string): Promise<string> {
    const storageRef = ref(this.storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  }

  async uploadVideo(file: File, path: string): Promise<string> {
    const storageRef = ref(this.storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  }

  // Follow/Unfollow
  async followUser(currentUserId: string, targetUserId: string) {
    const currentUserRef = doc(this.firestore, 'users', currentUserId);
    const targetUserRef = doc(this.firestore, 'users', targetUserId);
    
    const currentUser = await this.getUserProfile(currentUserId);
    const targetUser = await this.getUserProfile(targetUserId);
    
    if (currentUser && targetUser) {
      const following = currentUser.following || [];
      const followers = targetUser.followers || [];
      
      if (!following.includes(targetUserId)) {
        await updateDoc(currentUserRef, { following: [...following, targetUserId] });
      }
      if (!followers.includes(currentUserId)) {
        await updateDoc(targetUserRef, { followers: [...followers, currentUserId] });
      }
    }
  }

  async unfollowUser(currentUserId: string, targetUserId: string) {
    const currentUserRef = doc(this.firestore, 'users', currentUserId);
    const targetUserRef = doc(this.firestore, 'users', targetUserId);
    
    const currentUser = await this.getUserProfile(currentUserId);
    const targetUser = await this.getUserProfile(targetUserId);
    
    if (currentUser && targetUser) {
      const following = (currentUser.following || []).filter(id => id !== targetUserId);
      const followers = (targetUser.followers || []).filter(id => id !== currentUserId);
      
      await updateDoc(currentUserRef, { following });
      await updateDoc(targetUserRef, { followers });
    }
  }

  getUserPosts(userId: string): Observable<Post[]> {
    const postsRef = collection(this.firestore, 'posts');
    const q = query(postsRef, where('authorId', '==', userId), orderBy('createdAt', 'desc'));
    return from(getDocs(q)).pipe(
      map((snapshot: QuerySnapshot<DocumentData>) => snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Post)))
    );
  }
}

