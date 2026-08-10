import { Component, signal, Signal, inject, OnInit, OnDestroy, computed } from '@angular/core';
import { Subscription, forkJoin } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FirebaseService, UserProfile, Post, Comment } from '../../services/firebase.service';
import { RiotApiService, SummonerData, MatchData, ChampionMastery, LeagueEntry, ParticipantData } from '../../services/riot-api.service';
import { ChampionService } from '../../services/champion.service';
import { ProfileHeaderComponent } from '../../components/profile-header/profile-header.component';
import { ProfilePerformanceComponent } from '../../components/profile-performance/profile-performance.component';
import { ProfileTopChampionsComponent, type ChampionDisplay } from '../../components/profile-top-champions/profile-top-champions.component';
import { ProfileActivityTimelineComponent, type ActivityTimelineData } from '../../components/profile-activity-timeline/profile-activity-timeline.component';
import { readCachedUserProfile, writeCachedUserProfile } from '../../utils/profile-view-cache';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ProfileHeaderComponent,
    ProfilePerformanceComponent,
    ProfileTopChampionsComponent,
    ProfileActivityTimelineComponent
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit, OnDestroy {
  // Exponer URL global para usar en el template
  URL = URL;
  private firebaseService = inject(FirebaseService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private profileSubscription: Subscription | null = null;

  userId = signal<string | null>(null);
  profile = signal<UserProfile | null>(null);
  posts = signal<Post[]>([]);
  currentUserProfile = signal<UserProfile | null>(null);
  loading = signal(true);
  
  isOwnProfile = computed(() => {
    const currentUser = this.firebaseService.getCurrentUser();
    return currentUser && this.userId() === currentUser.uid;
  });

  isFollowing = signal(false);
  showPostModal = signal(false);
  selectedPost = signal<Post | null>(null);
  newComment = signal('');
  showEditModal = signal(false);
  showCreatePostModal = signal(false);
  
  // Carousel state for each post
  postImageIndices = signal<Map<string, number>>(new Map());
  
  // Edit profile
  editDisplayName = signal('');
  editBio = signal('');
  editPhotoFile = signal<File | null>(null);
  editPhotoPreview = signal<string | null>(null);
  uploadingPhoto = signal(false);
  showChampionSelector = signal(false);
  selectedChampion = signal<string | null>(null);
  
  // LoL Summoner search
  private riotApiService = inject(RiotApiService);
  private championService = inject(ChampionService);
  foundSummoner = signal<SummonerData | null>(null);
  searchingSummoner = signal(false);
  summonerError = signal<string | null>(null);

  // Portada editable
  editCoverFile = signal<File | null>(null);
  editCoverPreview = signal<string | null>(null);
  showCoverConfirm = signal(false);
  uploadingCover = signal(false);

  // Stats desde Riot API
  riotStats = signal<{ winRate: number; wins: number; losses: number; kda: number; wayiraScore: number; totalGames: number } | null>(null);
  topChampions = signal<{ championId: number; championName: string; points: number; level: number }[]>([]);
  activityMap = signal<Map<string, number>>(new Map());
  /** Partidas recientes (para última actividad y win rate por campeón) */
  recentMatches = signal<MatchData[]>([]);
  /** Estadísticas últimas 4 semanas (para comparación estilo Aurea) */
  last4WeeksStats = signal<{ winRate: number; kda: number; games: number; wins: number; losses: number } | null>(null);
  /** Por campeón: wins, games, winRate (desde partidas) */
  championWinRatesFromMatches = signal<Map<number, { wins: number; games: number; winRate: number }>>(new Map());
  /** Mejor rango Solo Q (desde leagues del summoner) */
  soloQRank = signal<LeagueEntry | null>(null);
  loadingRiot = signal(false);
  // Vincular Riot en editar perfil
  editGameName = signal('');
  editTagLine = signal('');
  editRegion = signal('la1');
  searchingLinkSummoner = signal(false);
  foundLinkSummoner = signal<SummonerData | null>(null);
  linkSummonerError = signal<string | null>(null);
  linkingRiot = signal(false);

  // Followers/Following modal
  showFollowersModal = signal(false);
  showFollowingModal = signal(false);
  followersList = signal<UserProfile[]>([]);
  followingList = signal<UserProfile[]>([]);
  loadingFollowers = signal(false);
  loadingFollowing = signal(false);
  
  regions = [
    { code: 'na1', name: 'NA - América del Norte' },
    { code: 'br1', name: 'BR - Brasil' },
    { code: 'la1', name: 'LAN - Latinoamérica Norte' },
    { code: 'la2', name: 'LAS - Latinoamérica Sur' },
    { code: 'euw1', name: 'EUW - Europa Oeste' },
    { code: 'eun1', name: 'EUNE - Europa Este' },
    { code: 'kr', name: 'KR - Corea' },
    { code: 'jp1', name: 'JP - Japón' }
  ];
  
  // Lista de campeones populares de LoL
  champions = [
    'Aatrox', 'Ahri', 'Akali', 'Akshan', 'Alistar', 'Ambessa', 'Amumu', 'Anivia', 'Annie', 'Aphelios', 'Ashe',
    'Aurelion Sol', 'Aurora', 'Azir', 'Bard', 'Bel\'Veth', 'Blitzcrank', 'Brand', 'Braum', 'Caitlyn', 'Camille', 'Cassiopeia',
    'Cho\'Gath', 'Corki', 'Darius', 'Diana', 'Draven', 'Dr. Mundo', 'Ekko', 'Elise', 'Evelynn', 'Ezreal',
    'Fiddlesticks', 'Fiora', 'Fizz', 'Galio', 'Gangplank', 'Garen', 'Gnar', 'Gragas', 'Graves', 'Gwen',
    'Hecarim', 'Heimerdinger', 'Hwei', 'Illaoi', 'Irelia', 'Ivern', 'Janna', 'Jarvan IV', 'Jax', 'Jayce',
    'Jhin', 'Jinx', 'K\'Sante', 'Kai\'Sa', 'Kalista', 'Karma', 'Karthus', 'Kassadin', 'Katarina', 'Kayle',
    'Kayn', 'Kennen', 'Kha\'Zix', 'Kindred', 'Kled', 'Kog\'Maw', 'LeBlanc', 'Lee Sin', 'Leona', 'Lillia',
    'Lissandra', 'Lucian', 'Lulu', 'Lux', 'Malphite', 'Malzahar', 'Maokai', 'Master Yi', 'Mel', 'Milio', 'Miss Fortune',
    'Mordekaiser', 'Morgana', 'Naafiri', 'Nami', 'Nasus', 'Nautilus', 'Neeko', 'Nidalee', 'Nilah', 'Nocturne',
    'Nunu & Willump', 'Olaf', 'Orianna', 'Ornn', 'Pantheon', 'Poppy', 'Pyke', 'Qiyana', 'Quinn', 'Rakan',
    'Rammus', 'Rek\'Sai', 'Rell', 'Renata Glasc', 'Renekton', 'Rengar', 'Riven', 'Rumble', 'Ryze', 'Samira',
    'Sejuani', 'Senna', 'Seraphine', 'Sett', 'Shaco', 'Shen', 'Shyvana', 'Singed', 'Sion', 'Sivir',
    'Skarner', 'Smolder', 'Sona', 'Soraka', 'Swain', 'Sylas', 'Syndra', 'Tahm Kench', 'Taliyah', 'Talon', 'Taric',
    'Teemo', 'Thresh', 'Tristana', 'Trundle', 'Tryndamere', 'Twisted Fate', 'Twitch', 'Udyr', 'Urgot', 'Varus',
    'Vayne', 'Veigar', 'Vel\'Koz', 'Vex', 'Vi', 'Viego', 'Viktor', 'Vladimir', 'Volibear', 'Warwick',
    'Wukong', 'Xayah', 'Xerath', 'Xin Zhao', 'Yasuo', 'Yone', 'Yorick', 'Yuumi', 'Yunara', 'Zaahen', 'Zac', 'Zed', 'Zeri',
    'Ziggs', 'Zilean', 'Zoe', 'Zyra'
  ];
  
  filteredChampions = signal<string[]>(this.champions);
  
  filterChampions(searchTerm: string) {
    if (!searchTerm.trim()) {
      this.filteredChampions.set(this.champions);
      return;
    }
    const term = searchTerm.toLowerCase();
    this.filteredChampions.set(this.champions.filter(champ => champ.toLowerCase().includes(term)));
  }
  
  // Create post from profile
  newPostContent = signal('');
  newPostImages = signal<File[]>([]);
  newPostVideo = signal<File | null>(null);
  uploadingPost = signal(false);
  imagePreviewCache = new Map<File, string>();
  videoPreviewCache = new Map<File, string>();
  previewUrls: string[] = [];

  ngOnInit() {
    this.route.params.subscribe(params => {
      const userId = params['id'];
      if (userId) {
        this.userId.set(userId);
        this.loadProfile(userId);
        this.loadPosts(userId);
      } else {
        const currentUser = this.firebaseService.getCurrentUser();
        if (currentUser) {
          this.userId.set(currentUser.uid);
          this.loadProfile(currentUser.uid);
          this.loadPosts(currentUser.uid);
        } else {
          this.router.navigate(['/login']);
        }
      }
    });
    this.loadCurrentUserProfile();
  }

  async loadProfile(userId: string) {
    const cached = readCachedUserProfile(userId);
    if (cached) {
      this.profile.set(cached);
      this.loading.set(false);
      this.subscribeToProfileRealtime(userId);
      if (cached.puuid && cached.region) {
        this.firebaseService.checkAndUpdateUserSummonerName(userId);
        this.loadRiotWithCache(cached);
      } else {
        this.riotStats.set(null);
        this.topChampions.set([]);
        this.activityMap.set(new Map());
        this.recentMatches.set([]);
        this.last4WeeksStats.set(null);
        this.championWinRatesFromMatches.set(new Map());
      }
    } else {
      this.loading.set(true);
    }

    try {
      const currentUid = this.firebaseService.getCurrentUser()?.uid;
      const [profile, currentUserProfile] = await Promise.all([
        this.firebaseService.getUserProfile(userId),
        currentUid ? this.firebaseService.getUserProfile(currentUid) : Promise.resolve<UserProfile | null>(null)
      ]);

      if (profile) {
        this.profile.set(profile);
        writeCachedUserProfile(userId, profile);
        if (!cached) {
          this.subscribeToProfileRealtime(userId);
          if (profile.puuid && profile.region) {
            this.firebaseService.checkAndUpdateUserSummonerName(userId);
            this.loadRiotWithCache(profile);
          } else {
            this.riotStats.set(null);
            this.topChampions.set([]);
            this.activityMap.set(new Map());
            this.recentMatches.set([]);
            this.last4WeeksStats.set(null);
            this.championWinRatesFromMatches.set(new Map());
          }
        } else if (profile.puuid && profile.region) {
          this.firebaseService.checkAndUpdateUserSummonerName(userId);
          this.loadRiotWithCache(profile);
        }
      } else if (!cached) {
        this.profile.set(null);
      }

      if (currentUid && profile && currentUserProfile) {
        const following = currentUserProfile.following || [];
        this.isFollowing.set(following.includes(userId));
      }
    } catch (error) {
      console.error('Error cargando perfil:', error);
    } finally {
      if (!cached) {
        this.loading.set(false);
      }
    }
  }

  loadPosts(userId: string) {
    this.firebaseService.getUserPosts(userId).subscribe({
      next: (posts) => this.posts.set(posts),
      error: () => this.posts.set([])
    });
  }

  async loadCurrentUserProfile() {
    const currentUser = this.firebaseService.getCurrentUser();
    if (currentUser) {
      const fromCache = readCachedUserProfile(currentUser.uid);
      if (fromCache) this.currentUserProfile.set(fromCache);
      const profile = await this.firebaseService.getUserProfile(currentUser.uid);
      if (profile) {
        this.currentUserProfile.set(profile);
        writeCachedUserProfile(currentUser.uid, profile);
      }
    }
  }

  async followUser() {
    const currentUser = this.firebaseService.getCurrentUser();
    const profile = this.profile();
    if (!currentUser || !profile || this.isOwnProfile()) return;

    const wasFollowing = this.isFollowing();
    
    try {
      if (wasFollowing) {
        await this.firebaseService.unfollowUser(currentUser.uid, profile.uid);
      } else {
        await this.firebaseService.followUser(currentUser.uid, profile.uid);
      }
      
      // Actualizar el estado inmediatamente (optimista)
      this.isFollowing.set(!wasFollowing);
      
      // Recargar los perfiles en paralelo para actualizar contadores
      const [updatedProfile, updatedCurrentUserProfile] = await Promise.all([
        this.firebaseService.getUserProfile(profile.uid),
        this.firebaseService.getUserProfile(currentUser.uid)
      ]);
      
      if (updatedProfile) {
        this.profile.set(updatedProfile);
        writeCachedUserProfile(profile.uid, updatedProfile);
      }

      if (updatedCurrentUserProfile) {
        this.currentUserProfile.set(updatedCurrentUserProfile);
        writeCachedUserProfile(currentUser.uid, updatedCurrentUserProfile);
        // Verificar el estado de seguimiento basado en el following del usuario actual
        const following = updatedCurrentUserProfile.following || [];
        const isNowFollowing = following.includes(profile.uid);
        this.isFollowing.set(isNowFollowing);
        console.log('Estado de seguimiento actualizado:', isNowFollowing);
        console.log('Siguiendo del usuario actual:', following);
        console.log('Seguidores del perfil objetivo:', updatedProfile?.followers || []);
      }
    } catch (error) {
      console.error('Error al seguir/dejar de seguir:', error);
      alert('Error al actualizar. Por favor intenta nuevamente.');
      // Revertir el estado si falló
      this.isFollowing.set(wasFollowing);
    }
  }

  sendMessage() {
    const profile = this.profile();
    if (!profile) return;
    this.router.navigate(['/messages'], { queryParams: { userId: profile.uid } });
  }

  openPost(post: Post) {
    this.selectedPost.set(post);
    // Inicializar el índice del carrusel si no existe
    if (post.id && !this.postImageIndices().has(post.id)) {
      this.setCurrentImageIndex(post.id, 0);
    }
    this.showPostModal.set(true);
  }

  getCurrentImageIndex(postId: string): number {
    return this.postImageIndices().get(postId) || 0;
  }

  setCurrentImageIndex(postId: string, index: number) {
    const currentMap = new Map(this.postImageIndices());
    currentMap.set(postId, index);
    this.postImageIndices.set(currentMap);
  }

  nextImage(post: Post, event: Event) {
    event.stopPropagation();
    if (!post.images || post.images.length <= 1) return;
    const currentIndex = this.getCurrentImageIndex(post.id || '');
    const nextIndex = (currentIndex + 1) % post.images.length;
    this.setCurrentImageIndex(post.id || '', nextIndex);
  }

  prevImage(post: Post, event: Event) {
    event.stopPropagation();
    if (!post.images || post.images.length <= 1) return;
    const currentIndex = this.getCurrentImageIndex(post.id || '');
    const prevIndex = (currentIndex - 1 + post.images.length) % post.images.length;
    this.setCurrentImageIndex(post.id || '', prevIndex);
  }

  goToImage(post: Post, index: number, event: Event) {
    event.stopPropagation();
    this.setCurrentImageIndex(post.id || '', index);
  }

  closePostModal() {
    this.showPostModal.set(false);
    this.selectedPost.set(null);
    this.newComment.set('');
  }

  async likePost(post: Post) {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !post.id) return;
    await this.firebaseService.likePost(post.id, user.uid);
    this.loadPosts(this.userId()!);
    // Actualizar el post seleccionado en tiempo real
    if (this.selectedPost()?.id === post.id) {
      this.firebaseService.getPostById(post.id).subscribe({
        next: (updatedPost) => {
          if (updatedPost) {
            this.selectedPost.set(updatedPost);
          }
        }
      });
    }
  }

  async dislikePost(post: Post) {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !post.id) return;
    await this.firebaseService.dislikePost(post.id, user.uid);
    this.loadPosts(this.userId()!);
    // Actualizar el post seleccionado en tiempo real
    if (this.selectedPost()?.id === post.id) {
      this.firebaseService.getPostById(post.id).subscribe({
        next: (updatedPost) => {
          if (updatedPost) {
            this.selectedPost.set(updatedPost);
          }
        }
      });
    }
  }

  async addComment() {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !this.selectedPost()?.id || !this.newComment().trim()) return;

    await this.firebaseService.addComment(this.selectedPost()!.id!, {
      authorId: user.uid,
      authorName: this.currentUserProfile()!.displayName,
      authorPhoto: this.currentUserProfile()!.photoURL,
      content: this.newComment()
    });

    this.newComment.set('');
    this.loadPosts(this.userId()!);
    const updatedPost = this.posts().find(p => p.id === this.selectedPost()?.id);
    if (updatedPost) {
      this.selectedPost.set(updatedPost);
    }
  }

  async likeComment(commentIndex: number) {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !this.selectedPost()?.id) return;
    await this.firebaseService.likeComment(this.selectedPost()!.id!, commentIndex, user.uid);
    this.loadPosts(this.userId()!);
    const updatedPost = this.posts().find(p => p.id === this.selectedPost()?.id);
    if (updatedPost) {
      this.selectedPost.set(updatedPost);
    }
  }

  async dislikeComment(commentIndex: number) {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !this.selectedPost()?.id) return;
    await this.firebaseService.dislikeComment(this.selectedPost()!.id!, commentIndex, user.uid);
    this.loadPosts(this.userId()!);
    const updatedPost = this.posts().find(p => p.id === this.selectedPost()?.id);
    if (updatedPost) {
      this.selectedPost.set(updatedPost);
    }
  }

  isLiked(post: Post): boolean {
    const user = this.firebaseService.getCurrentUser();
    return user ? (post.likes || []).includes(user.uid) : false;
  }

  isDisliked(post: Post): boolean {
    const user = this.firebaseService.getCurrentUser();
    return user ? (post.dislikes || []).includes(user.uid) : false;
  }

  formatDate(timestamp: any): string {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('es-ES', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
  }

  getFollowersCount(): number {
    return (this.profile()?.followers || []).length;
  }

  getFollowingCount(): number {
    return (this.profile()?.following || []).length;
  }

  async openFollowersModal() {
    const profile = this.profile();
    if (!profile || !profile.followers || profile.followers.length === 0) return;
    
    this.showFollowersModal.set(true);
    this.loadingFollowers.set(true);
    
    try {
      const followersProfiles = await Promise.all(
        profile.followers.map(userId => this.firebaseService.getUserProfile(userId))
      );
      this.followersList.set(followersProfiles.filter(p => p !== null) as UserProfile[]);
    } catch (error) {
      console.error('Error cargando seguidores:', error);
    } finally {
      this.loadingFollowers.set(false);
    }
  }

  async openFollowingModal() {
    const profile = this.profile();
    if (!profile || !profile.following || profile.following.length === 0) return;
    
    this.showFollowingModal.set(true);
    this.loadingFollowing.set(true);
    
    try {
      const followingProfiles = await Promise.all(
        profile.following.map(userId => this.firebaseService.getUserProfile(userId))
      );
      this.followingList.set(followingProfiles.filter(p => p !== null) as UserProfile[]);
    } catch (error) {
      console.error('Error cargando siguiendo:', error);
    } finally {
      this.loadingFollowing.set(false);
    }
  }

  closeFollowersModal() {
    this.showFollowersModal.set(false);
    this.followersList.set([]);
  }

  closeFollowingModal() {
    this.showFollowingModal.set(false);
    this.followingList.set([]);
  }

  getPostsCount(): number {
    return this.posts().length;
  }

  openCreateModal() {
    this.showCreatePostModal.set(true);
  }

  closeCreatePostModal() {
    this.cleanupPreviewUrls();
    this.showCreatePostModal.set(false);
    this.newPostContent.set('');
    this.newPostImages.set([]);
    this.newPostVideo.set(null);
  }

  /** Caché 30 min: al reabrir el perfil se muestra al instante y se actualiza en segundo plano. */
  private readonly RIOT_CACHE_TTL_MS = 30 * 60 * 1000;

  private getRiotCacheKey(uid: string): string {
    return `wayira_riot_cache_${uid}`;
  }

  private applyRiotSnapshot(snapshot: {
    stats?: { winRate: number; wins: number; losses: number; kda: number; wayiraScore: number; totalGames: number } | null;
    champions?: { championId: number; championName: string; points: number; level: number }[];
    activity?: Record<string, number>;
    last4?: { winRate: number; kda: number; games: number; wins: number; losses: number } | null;
    champWinRates?: [number, { wins: number; games: number; winRate: number }][];
    soloQRank?: LeagueEntry | null;
  }): boolean {
    let applied = false;
    if (snapshot.stats) {
      this.riotStats.set(snapshot.stats);
      applied = true;
    }
    if (snapshot.champions?.length) {
      this.topChampions.set(snapshot.champions);
      applied = true;
    }
    if (snapshot.activity && typeof snapshot.activity === 'object') {
      this.activityMap.set(new Map(Object.entries(snapshot.activity).map(([k, v]) => [k, v])));
      this.activityTimelineData = null;
      applied = true;
    }
    if (snapshot.last4) {
      this.last4WeeksStats.set(snapshot.last4);
      applied = true;
    }
    if (snapshot.champWinRates?.length) {
      this.championWinRatesFromMatches.set(new Map(snapshot.champWinRates));
      applied = true;
    }
    if (snapshot.soloQRank && typeof snapshot.soloQRank === 'object') {
      this.soloQRank.set(snapshot.soloQRank);
      applied = true;
    }
    return applied;
  }

  private loadRiotSnapshotFromProfile(profile: UserProfile): boolean {
    const raw = (profile as any)?.riotSnapshot;
    if (!raw || typeof raw !== 'object') return false;
    return this.applyRiotSnapshot(raw);
  }

  private loadRiotFromCache(uid: string): boolean {
    try {
      const raw = localStorage.getItem(this.getRiotCacheKey(uid));
      if (!raw) return false;
      const data = JSON.parse(raw) as {
        stats: unknown;
        champions: unknown[];
        activity: Record<string, number>;
        last4?: { winRate: number; kda: number; games: number; wins: number; losses: number };
        champWinRates?: [number, { wins: number; games: number; winRate: number }][];
        soloQRank?: LeagueEntry | null;
        at: number;
      };
      if (!data || data.at + this.RIOT_CACHE_TTL_MS < Date.now()) return false;
      return this.applyRiotSnapshot({
        stats: data.stats as any,
        champions: data.champions as any,
        activity: data.activity,
        last4: data.last4 || null,
        champWinRates: data.champWinRates || [],
        soloQRank: (data.soloQRank as LeagueEntry | null) || null
      });
    } catch {
      return false;
    }
  }

  private saveRiotToCache(
    uid: string,
    stats: typeof this.riotStats extends Signal<infer T> ? T : never,
    champions: typeof this.topChampions extends Signal<infer T> ? T : never,
    activity: Map<string, number>,
    last4: { winRate: number; kda: number; games: number; wins: number; losses: number } | null,
    champWinRates: Map<number, { wins: number; games: number; winRate: number }>,
    soloQRank: LeagueEntry | null
  ) {
    try {
      const obj = Object.fromEntries(activity);
      const payload: Record<string, unknown> = {
        stats,
        champions,
        activity: obj,
        at: Date.now()
      };
      if (last4) payload['last4'] = last4;
      payload['champWinRates'] = Array.from(champWinRates.entries());
      if (soloQRank) payload['soloQRank'] = soloQRank;
      localStorage.setItem(this.getRiotCacheKey(uid), JSON.stringify(payload));
    } catch {}
  }

  private async saveRiotSnapshotToProfile(
    uid: string,
    stats: { winRate: number; wins: number; losses: number; kda: number; wayiraScore: number; totalGames: number } | null,
    champions: { championId: number; championName: string; points: number; level: number }[],
    activity: Map<string, number>,
    last4: { winRate: number; kda: number; games: number; wins: number; losses: number } | null,
    champWinRates: Map<number, { wins: number; games: number; winRate: number }>,
    soloQRank: LeagueEntry | null
  ) {
    try {
      await this.firebaseService.updateUserProfile(uid, {
        riotSnapshot: {
          stats,
          champions,
          activity: Object.fromEntries(activity),
          last4,
          champWinRates: Array.from(champWinRates.entries()),
          soloQRank,
          updatedAt: Date.now()
        }
      } as any);
    } catch {
      // Si falla guardar snapshot en Firestore, seguimos con la UX local sin bloquear.
    }
  }

  /** Carga datos Riot: muestra caché al instante si existe y está reciente; actualiza en segundo plano. */
  loadRiotWithCache(profile: UserProfile) {
    const uid = profile.uid;
    const fromCache = this.loadRiotFromCache(uid);
    const fromProfileSnapshot = !fromCache ? this.loadRiotSnapshotFromProfile(profile) : false;
    if (fromCache || fromProfileSnapshot) this.loadingRiot.set(false);
    this.loadRiotProfileData(profile, true);
  }

  loadRiotProfileData(profile: UserProfile, backgroundRefresh = false) {
    const region = profile.region!;
    const puuid = profile.puuid!;
    const uid = profile.uid;
    if (!backgroundRefresh) {
      this.loadingRiot.set(true);
      this.riotStats.set(null);
      this.topChampions.set([]);
      this.activityMap.set(new Map());
      this.recentMatches.set([]);
      this.last4WeeksStats.set(null);
      this.championWinRatesFromMatches.set(new Map());
      this.soloQRank.set(null);
    }

    this.riotApiService.getSummoner(region, profile.gameName!, profile.tagLine!).subscribe({
      next: (summoner) => {
        let wins = 0, losses = 0;
        const leagues = summoner.leagues || [];
        leagues.forEach((l: LeagueEntry) => {
          wins += l.wins || 0;
          losses += l.losses || 0;
        });
        const soloQ = leagues.find((l: LeagueEntry) => l.queueType === 'RANKED_SOLO_5x5') ?? null;
        this.soloQRank.set(soloQ);
        const totalLeague = wins + losses;
        const winRate = totalLeague > 0 ? Math.round((wins / totalLeague) * 1000) / 10 : 0;

        forkJoin({
          matches: this.riotApiService.getMatches(region, puuid, 100),
          mastery: this.riotApiService.getChampionMastery(region, puuid, 6)
        }).subscribe({
          next: ({ matches, mastery }) => {
            let k = 0, d = 0, a = 0;
            const dayCount = new Map<string, number>();
            const fourWeeksAgo = Date.now() - 4 * 7 * 24 * 60 * 60 * 1000;
            let last4Wins = 0, last4Losses = 0, last4K = 0, last4D = 0, last4A = 0, last4Games = 0;
            const champStats = new Map<number, { wins: number; games: number }>();

            matches.forEach((m: MatchData) => {
              const part = m.info?.participants?.find((p: any) => p.puuid === puuid);
              if (part) {
                k += part.kills || 0;
                d += part.deaths || 0;
                a += part.assists || 0;
                const dateKey = this.formatDateKeyColombia(new Date(m.info?.gameCreation || 0));
                dayCount.set(dateKey, (dayCount.get(dateKey) || 0) + 1);
                const created = m.info?.gameCreation || 0;
                if (created >= fourWeeksAgo) {
                  last4Games++;
                  if (part.win) last4Wins++; else last4Losses++;
                  last4K += part.kills || 0;
                  last4D += part.deaths || 0;
                  last4A += part.assists || 0;
                }
                const cid = part.championId ?? 0;
                if (cid) {
                  const cur = champStats.get(cid) || { wins: 0, games: 0 };
                  cur.games++;
                  if (part.win) cur.wins++;
                  champStats.set(cid, cur);
                }
              }
            });

            const games = matches.length;
            const totalKda = games > 0 && d > 0 ? (k + a) / d : (k + a);
            const kda = Math.round(totalKda * 100) / 100;
            const wayiraScore = totalLeague > 0 ? Math.round((winRate * 0.4 + Math.min(totalKda * 10, 60)) * 10) / 10 : 0;
            this.riotStats.set({
              winRate: totalLeague > 0 ? winRate : 0,
              wins,
              losses,
              kda,
              wayiraScore: wayiraScore || 0,
              totalGames: totalLeague || games
            });
            this.activityMap.set(dayCount);
            this.activityTimelineData = null;
            this.recentMatches.set(matches);

            if (last4Games > 0) {
              const last4WR = Math.round((last4Wins / last4Games) * 1000) / 10;
              const last4Kda = last4D > 0 ? (last4K + last4A) / last4D : (last4K + last4A);
              this.last4WeeksStats.set({
                winRate: last4WR,
                kda: Math.round(last4Kda * 100) / 100,
                games: last4Games,
                wins: last4Wins,
                losses: last4Losses
              });
            } else {
              this.last4WeeksStats.set(null);
            }

            const champWinRates = new Map<number, { wins: number; games: number; winRate: number }>();
            champStats.forEach((v, cid) => {
              champWinRates.set(cid, {
                wins: v.wins,
                games: v.games,
                winRate: Math.round((v.wins / v.games) * 100)
              });
            });
            this.championWinRatesFromMatches.set(champWinRates);

            const list = mastery.map((m: ChampionMastery) => ({
              championId: m.championId,
              championName: this.championService.getChampionName(m.championId),
              points: m.championPoints,
              level: m.championLevel
            }));
            this.topChampions.set(list);
            this.loadingRiot.set(false);
            this.saveRiotToCache(
              uid,
              this.riotStats()!,
              this.topChampions(),
              this.activityMap(),
              this.last4WeeksStats(),
              this.championWinRatesFromMatches(),
              this.soloQRank()
            );
            this.saveRiotSnapshotToProfile(
              uid,
              this.riotStats(),
              this.topChampions(),
              this.activityMap(),
              this.last4WeeksStats(),
              this.championWinRatesFromMatches(),
              this.soloQRank()
            );
          },
          error: () => {
            if (!this.riotStats()) {
              this.loadRiotSnapshotFromProfile(profile);
            }
            this.loadingRiot.set(false);
          }
        });
      },
      error: () => {
        if (!this.riotStats()) {
          this.loadRiotSnapshotFromProfile(profile);
        }
        this.loadingRiot.set(false);
      }
    });
  }

  onCoverSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      this.editCoverFile.set(input.files[0]);
      const reader = new FileReader();
      reader.onload = () => this.editCoverPreview.set(reader.result as string);
      reader.readAsDataURL(input.files[0]);
      this.showCoverConfirm.set(true);
    }
  }

  cancelCoverChange() {
    this.showCoverConfirm.set(false);
    this.editCoverFile.set(null);
    this.editCoverPreview.set(null);
  }

  async confirmCoverChange() {
    const user = this.firebaseService.getCurrentUser();
    const profile = this.profile();
    const file = this.editCoverFile();
    if (!user || !profile || !file || this.userId() !== user.uid) return;
    this.uploadingCover.set(true);
    try {
      const url = await this.firebaseService.uploadImage(file, `covers/${user.uid}/${Date.now()}_${file.name}`);
      await this.firebaseService.updateUserProfile(user.uid, { coverImageURL: url });
      this.profile.set({ ...profile, coverImageURL: url });
      this.cancelCoverChange();
    } catch (e) {
      console.error(e);
      alert('Error al subir la portada.');
    } finally {
      this.uploadingCover.set(false);
    }
  }

  getChampionImageUrl(championId: number): string {
    const name = this.championService.getChampionName(championId);
    const key = name === 'Unknown' ? '' : name;
    return key ? `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/${key}.png` : '';
  }

  /** Nombre del tipo de cola (estilo Aurea). */
  getQueueTypeName(queueId: number): string {
    const names: Record<number, string> = {
      420: 'Ranked Solo/Duo',
      440: 'Flex 5v5',
      400: 'Normal Draft',
      1020: 'One For All',
      1300: 'Nexus Blitz',
      1400: 'Ultimate Spellbook',
      1700: 'Arena'
    };
    return names[queueId] || (queueId >= 0 ? `Cola ${queueId}` : 'Partida');
  }

  /** Última partida con el participante del usuario para la tarjeta de actividad reciente. */
  getLastMatchForCard(): { match: MatchData; participant: ParticipantData } | null {
    const matches = this.recentMatches();
    const puuid = this.profile()?.puuid;
    if (!puuid || !matches?.length) return null;
    const m = matches[0];
    const part = m.info?.participants?.find((p: any) => p.puuid === puuid);
    return part ? { match: m, participant: part as ParticipantData } : null;
  }

  /** Farm/10 para una partida (CS por 10 min). */
  getFarmPer10(participant: ParticipantData, gameDurationSeconds: number): number {
    if (!gameDurationSeconds) return 0;
    const mins = gameDurationSeconds / 60;
    const cs = participant.totalMinionsKilled ?? 0;
    return Math.round((cs / mins) * 100) / 10;
  }

  getChampionWinRate(championId: number): number | null {
    const map = this.championWinRatesFromMatches();
    const v = map.get(championId);
    return v ? v.winRate : null;
  }

  /** Zona horaria de Colombia para todo el activity timeline (enero–diciembre preciso). */
  private readonly COLOMBIA_TZ = 'America/Bogota';

  /** Dado un Date (timestamp), devuelve YYYY-MM-DD en zona Colombia. */
  private formatDateKeyColombia(d: Date): string {
    return d.toLocaleDateString('en-CA', { timeZone: this.COLOMBIA_TZ });
  }

  /** Día del año en Colombia: 0 = 1 ene, 1 = 2 ene, … (medianoche Colombia como instante UTC). */
  private dateAtColombiaDayIndex(year: number, dayIndex: number): Date {
    return new Date(Date.UTC(year, 0, 1, 5, 0, 0, 0) + dayIndex * 24 * 60 * 60 * 1000);
  }

  getActivityCount(dateKey: string): number {
    return this.activityMap().get(dateKey) || 0;
  }

  getActivityLevel(dateKey: string): number {
    const c = this.getActivityCount(dateKey);
    if (c === 0) return 0;
    if (c <= 2) return 1;
    if (c <= 5) return 2;
    if (c <= 9) return 3;
    return 4;
  }

  getActivityGrid(): { dateKey: string; level: number }[] {
    const out: { dateKey: string; level: number }[] = [];
    const year = new Date().getFullYear();
    const todayKey = this.formatDateKeyColombia(new Date());
    const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const numDays = isLeap(year) ? 366 : 365;
    for (let i = 0; i < numDays; i++) {
      const d = this.dateAtColombiaDayIndex(year, i);
      const dateKey = this.formatDateKeyColombia(d);
      if (dateKey > todayKey) break;
      out.push({ dateKey, level: this.getActivityLevel(dateKey) });
    }
    return out;
  }

  getActivityTotal(): number {
    return this.getTotalMatchesThisYear();
  }

  /** Timeline por mes × día: orden cronológico (1 ene, 2 ene, … 31 ene, 1 feb, …). */
  private activityTimelineData: Map<string, { dateKey: string; level: number; count: number }> | null = null;

  private buildActivityTimelineData(): void {
    this.activityMap();
    const year = new Date().getFullYear();
    const map = new Map<string, { dateKey: string; level: number; count: number }>();
    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if ((year % 4 !== 0) || (year % 100 === 0 && year % 400 !== 0)) daysInMonth[1] = 28;
    for (let month = 0; month < 12; month++) {
      for (let day = 1; day <= daysInMonth[month]; day++) {
        const d = this.dateAtColombiaDayIndex(year, this.dayOfYear(month, day, year) - 1);
        const dateKey = this.formatDateKeyColombia(d);
        const count = this.getActivityCount(dateKey);
        map.set(`${month}-${day}`, { dateKey, level: this.getActivityLevel(dateKey), count });
      }
    }
    this.activityTimelineData = map;
  }

  private dayOfYear(month: number, day: number, year: number): number {
    const daysBefore = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const offset = leap && month >= 2 ? 1 : 0;
    return daysBefore[month] + offset + day;
  }

  getActivityTimelineMonths(): { monthIndex: number; monthLabel: string }[] {
    const labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sept', 'Oct', 'Nov', 'Dic'];
    return labels.map((monthLabel, monthIndex) => ({ monthIndex, monthLabel }));
  }

  getActivityTimelineDays(): number[] {
    return Array.from({ length: 31 }, (_, i) => i + 1);
  }

  getActivityCellByMonthDay(monthIndex: number, dayNum: number): { dateKey: string; level: number; count: number } | null {
    if (!this.activityTimelineData) this.buildActivityTimelineData();
    return this.activityTimelineData!.get(`${monthIndex}-${dayNum}`) || null;
  }

  getActivityCellTooltip(cell: { dateKey: string; count: number }): string {
    if (!cell || !cell.dateKey) return '';
    const [, m, dayStr] = cell.dateKey.split('-');
    const monthNames: Record<string, string> = { '01': 'enero', '02': 'febrero', '03': 'marzo', '04': 'abril', '05': 'mayo', '06': 'junio', '07': 'julio', '08': 'agosto', '09': 'septiembre', '10': 'octubre', '11': 'noviembre', '12': 'diciembre' };
    const day = parseInt(dayStr, 10);
    const month = monthNames[m] || m;
    const partidas = cell.count || 0;
    return `${day} ${month}: ${partidas} partida${partidas !== 1 ? 's' : ''}`;
  }

  /** Datos para el componente activity timeline (vista por mes). */
  getActivityTimelineData(): ActivityTimelineData | null {
    if (this.getActivityTimelineMonths().length === 0 || this.getActivityTimelineDays().length === 0) return null;
    if (!this.activityTimelineData) this.buildActivityTimelineData();
    const cells: Record<string, { level: number; count: number; dateKey?: string }> = {};
    const monthlyTotals = new Array<number>(12).fill(0);
    this.activityTimelineData!.forEach((v, k) => {
      cells[k] = { level: v.level, count: v.count, dateKey: v.dateKey };
      const monthIndex = parseInt(k.split('-')[0], 10);
      if (monthIndex >= 0 && monthIndex < 12) monthlyTotals[monthIndex] += v.count;
    });
    return {
      months: this.getActivityTimelineMonths(),
      days: this.getActivityTimelineDays(),
      cells,
      total: this.getActivityTotal(),
      monthlyTotals
    };
  }

  /** Lista de campeones con imageUrl y winRate para el componente top-champions. */
  getChampionsForDisplay(): ChampionDisplay[] {
    return this.topChampions().map(champ => ({
      championId: champ.championId,
      championName: champ.championName,
      points: champ.points,
      level: champ.level,
      winRate: this.getChampionWinRate(champ.championId) ?? undefined,
      imageUrl: this.getChampionImageUrl(champ.championId)
    }));
  }

  /** Tier en español para la tarjeta Solo Q. */
  private formatSoloQRank(entry: LeagueEntry): string {
    const tierMap: Record<string, string> = {
      IRON: 'Hierro', BRONZE: 'Bronce', SILVER: 'Plata', GOLD: 'Oro', PLATINUM: 'Platino',
      EMERALD: 'Esmeralda', DIAMOND: 'Diamante', MASTER: 'Maestro',
      GRANDMASTER: 'Gran Maestro', CHALLENGER: 'Aspirante'
    };
    const tier = tierMap[entry.tier?.toUpperCase() || ''] || entry.tier || '';
    if (entry.tier === 'MASTER' || entry.tier === 'GRANDMASTER' || entry.tier === 'CHALLENGER') {
      return `${tier} ${entry.leaguePoints ?? 0} LP`;
    }
    return `${tier} ${entry.rank || ''}`.trim();
  }

  getSoloQRankLabel(): string | null {
    const entry = this.soloQRank();
    if (!entry) return null;
    const label = this.formatSoloQRank(entry);
    return label || null;
  }

  getSoloQRankIconUrl(): string | null {
    const entry = this.soloQRank();
    if (!entry?.tier) return null;
    const tier = entry.tier.toLowerCase();
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tier}.png`;
  }

  /** Tarjeta Solo Q (mejor rango/elo) para el header (estilo Aurea). */
  getProfileScoreCard(): { period: string; value: number | string; label: string } | null {
    const entry = this.soloQRank();
    if (!entry) return null;
    return {
      period: 'Clasificatoria solo',
      value: this.formatSoloQRank(entry),
      label: 'Mejor rango'
    };
  }

  getJoinDate(): string {
    const p = this.profile();
    if (!p?.createdAt?.toDate) return '';
    return p.createdAt.toDate().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  }

  getProfileHandle(): string {
    const p = this.profile();
    if (!p) return 'usuario';
    if (p.gameName) return p.gameName.replace(/\s/g, '').toLowerCase();
    return (p.displayName || 'usuario').replace(/\s/g, '').toLowerCase().slice(0, 20);
  }

  getActivitiesCount(): number {
    const posts = this.getPostsCount();
    const riotTotal = this.getTotalMatchesThisYear();
    return posts + riotTotal;
  }

  getTotalMatchesThisYear(): number {
    const map = this.activityMap();
    const year = new Date().getFullYear().toString();
    let total = 0;
    map.forEach((count, dateKey) => {
      if (dateKey.startsWith(year)) total += count;
    });
    return total;
  }

  openEditModal() {
    const profile = this.profile();
    if (profile) {
      this.editDisplayName.set(profile.displayName);
      this.editBio.set(profile.bio || '');
      this.editPhotoPreview.set(profile.photoURL || null);
      this.editGameName.set(profile.gameName || '');
      this.editTagLine.set(profile.tagLine || '');
      this.editRegion.set(profile.region || 'la1');
      this.filteredChampions.set(this.champions);
      this.foundLinkSummoner.set(null);
      this.linkSummonerError.set(null);
      this.showEditModal.set(true);
    }
  }

  closeEditModal() {
    this.showEditModal.set(false);
    this.editDisplayName.set('');
    this.editBio.set('');
    this.editPhotoFile.set(null);
    this.editPhotoPreview.set(null);
    this.showChampionSelector.set(false);
    this.selectedChampion.set(null);
    this.foundSummoner.set(null);
    this.summonerError.set(null);
    this.foundLinkSummoner.set(null);
    this.linkSummonerError.set(null);
  }

  searchSummonerForLink() {
    const gameName = this.editGameName().trim();
    const tagLine = this.editTagLine().trim();
    const region = this.editRegion();
    if (!gameName || !tagLine) {
      this.linkSummonerError.set('Ingresa nombre de invocador y tag.');
      return;
    }
    this.linkSummonerError.set(null);
    this.foundLinkSummoner.set(null);
    this.searchingLinkSummoner.set(true);
    this.riotApiService.getSummoner(region, gameName, tagLine).subscribe({
      next: (data) => {
        this.foundLinkSummoner.set(data);
        this.searchingLinkSummoner.set(false);
      },
      error: (err) => {
        this.searchingLinkSummoner.set(false);
        if (err.status === 404) {
          this.linkSummonerError.set('Invocador no encontrado. Revisa nombre, tag y región.');
        } else {
          this.linkSummonerError.set('Error al buscar. Intenta de nuevo.');
        }
      }
    });
  }

  async linkRiotAccount() {
    const user = this.firebaseService.getCurrentUser();
    const profile = this.profile();
    const found = this.foundLinkSummoner();
    if (!user || !profile || !found || user.uid !== profile.uid) return;
    this.linkingRiot.set(true);
    try {
      await this.firebaseService.updateUserProfile(user.uid, {
        gameName: found.gameName,
        tagLine: found.tagLine,
        region: this.editRegion(),
        puuid: found.puuid
      });
      this.foundLinkSummoner.set(null);
      await this.loadProfile(user.uid);
      if (this.profile()?.puuid && this.profile()?.region) {
        this.loadRiotProfileData(this.profile()!);
      }
    } catch (e) {
      console.error(e);
      alert('Error al vincular la cuenta.');
    } finally {
      this.linkingRiot.set(false);
    }
  }

  async unlinkRiotAccount() {
    if (!confirm('¿Desvincular cuenta Riot? Las estadísticas dejarán de mostrarse.')) return;
    const user = this.firebaseService.getCurrentUser();
    const profile = this.profile();
    if (!user || !profile || user.uid !== profile.uid) return;
    try {
      await this.firebaseService.updateUserProfile(user.uid, {
        gameName: undefined,
        tagLine: undefined,
        region: undefined,
        puuid: undefined
      });
      await this.loadProfile(user.uid);
      this.riotStats.set(null);
      this.topChampions.set([]);
      this.activityMap.set(new Map());
      this.activityTimelineData = null;
    } catch (e) {
      console.error(e);
      alert('Error al desvincular.');
    }
  }
  
  async loadSummonerIcon() {
    const profile = this.profile();
    if (!profile?.gameName || !profile?.tagLine || !profile?.region) {
      alert('No tienes un nombre de invocador y tagline configurados en tu perfil. Por favor configúralos primero.');
      return;
    }
    
    this.showChampionSelector.set(false);
    this.selectedChampion.set(null);
    this.editPhotoFile.set(null);
    this.searchingSummoner.set(true);
    this.summonerError.set(null);
    this.foundSummoner.set(null);
    
    this.riotApiService.getSummoner(profile.region, profile.gameName, profile.tagLine)
      .subscribe({
        next: (data) => {
          this.foundSummoner.set(data);
          this.searchingSummoner.set(false);
          // Cargar automáticamente la foto de perfil del invocador
          const iconUrl = this.getProfileIconUrl(data.profileIconId);
          this.editPhotoPreview.set(iconUrl);
          this.editPhotoFile.set(null);
          this.selectedChampion.set(null);
        },
        error: (err) => {
          this.searchingSummoner.set(false);
          if (err.status === 404) {
            this.summonerError.set('Jugador no encontrado. Verifica tu nombre de invocador y tagline en tu perfil.');
          } else if (err.error?.error) {
            this.summonerError.set(err.error.error);
          } else {
            this.summonerError.set('Error al buscar el jugador. Intenta nuevamente.');
          }
          // Mostrar el error temporalmente
          setTimeout(() => {
            this.summonerError.set(null);
          }, 5000);
        }
      });
  }
  
  
  getProfileIconUrl(iconId: number): string {
    return `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${iconId}.png`;
  }
  

  onPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.editPhotoFile.set(file);
      this.selectedChampion.set(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        this.editPhotoPreview.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  selectChampion(champion: string) {
    this.selectedChampion.set(champion);
    this.editPhotoFile.set(null);
    // Normalizar el nombre del campeón para la URL
    let championKey = champion.replace(/'/g, '').replace(/\s/g, '');
    // Casos especiales
    if (champion === 'Dr. Mundo') championKey = 'DrMundo';
    if (champion === 'Jarvan IV') championKey = 'JarvanIV';
    if (champion === 'K\'Sante') championKey = 'KSante';
    if (champion === 'Kai\'Sa') championKey = 'Kaisa';
    if (champion === 'Kha\'Zix') championKey = 'Khazix';
    if (champion === 'Kog\'Maw') championKey = 'KogMaw';
    if (champion === 'Nunu & Willump') championKey = 'Nunu';
    if (champion === 'Rek\'Sai') championKey = 'RekSai';
    if (champion === 'Vel\'Koz') championKey = 'Velkoz';
    if (champion === 'Bel\'Veth') championKey = 'Belveth';
    if (champion === 'Cho\'Gath') championKey = 'Chogath';
    if (champion === 'Renata Glasc') championKey = 'Renata';
    if (champion === 'Tahm Kench') championKey = 'TahmKench';
    if (champion === 'Twisted Fate') championKey = 'TwistedFate';
    if (champion === 'Master Yi') championKey = 'MasterYi';
    if (champion === 'Miss Fortune') championKey = 'MissFortune';
    if (champion === 'Xin Zhao') championKey = 'XinZhao';
    
    const championImageUrl = `https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/${championKey}.png`;
    this.editPhotoPreview.set(championImageUrl);
  }

  toggleChampionSelector() {
    this.showChampionSelector.set(!this.showChampionSelector());
  }

  async saveProfile() {
    const user = this.firebaseService.getCurrentUser();
    const profile = this.profile();
    if (!user || !profile) return;

    this.uploadingPhoto.set(true);
    try {
      let photoURL: string | undefined | null = profile.photoURL;

      if (this.editPhotoFile()) {
        const file = this.editPhotoFile()!;
        photoURL = await this.firebaseService.uploadImage(file, `profiles/${user.uid}/${Date.now()}_${file.name}`);
      } else if (this.foundSummoner()) {
        // Si se buscó un invocador, usar su icono de perfil
        photoURL = this.editPhotoPreview() || null;
        console.log('Guardando foto del invocador:', photoURL);
      } else if (this.selectedChampion()) {
        // Si se seleccionó un campeón, usar su imagen
        photoURL = this.editPhotoPreview() || null;
      }

      const updateData: any = {
        displayName: this.editDisplayName(),
        bio: this.editBio()
      };
      
      // Actualizar photoURL si hay un cambio o si se seleccionó un invocador/campeón
      // Asegurarse de incluir null explícitamente si no hay foto
      if (photoURL !== profile.photoURL || this.foundSummoner() || this.selectedChampion()) {
        updateData.photoURL = photoURL !== undefined ? photoURL : null;
        console.log('Actualizando photoURL:', updateData.photoURL);
      }

      await this.firebaseService.updateUserProfile(user.uid, updateData);
      console.log('Perfil actualizado en Firestore:', updateData);

      // Esperar un poco para que se propaguen los cambios
      await new Promise(resolve => setTimeout(resolve, 500));

      // Recargar el perfil y el perfil del usuario actual
      await this.loadProfile(user.uid);
      await this.loadCurrentUserProfile();
      
      // Forzar actualización del signal del perfil
      const updatedProfile = await this.firebaseService.getUserProfile(user.uid);
      console.log('Perfil recargado:', updatedProfile);
      this.profile.set(updatedProfile);
      
      // Recargar los posts para actualizar las fotos en las publicaciones
      if (this.userId()) {
        this.loadPosts(this.userId()!);
      }
      
      this.closeEditModal();
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Error al actualizar el perfil. Por favor intenta nuevamente.');
    } finally {
      this.uploadingPhoto.set(false);
    }
  }

  async createPostFromProfile() {
    const user = this.firebaseService.getCurrentUser();
    if (!user) {
      alert('Debes iniciar sesión para publicar');
      return;
    }
    
    if (!this.newPostContent().trim()) {
      alert('Por favor ingresa contenido para la publicación');
      return;
    }

    this.uploadingPost.set(true);
    try {
      const images: string[] = [];
      const currentUserProfile = this.currentUserProfile();

      // Subir imágenes
      for (const file of this.newPostImages()) {
        const url = await this.firebaseService.uploadImage(file, `posts/${user.uid}/${Date.now()}_${file.name}`);
        images.push(url);
      }

      // Subir video
      let videoUrl: string | undefined;
      if (this.newPostVideo()) {
        videoUrl = await this.firebaseService.uploadVideo(this.newPostVideo()!, `posts/${user.uid}/${Date.now()}_${this.newPostVideo()!.name}`);
      }

      await this.firebaseService.createPost({
        authorId: user.uid,
        authorName: currentUserProfile?.displayName || user.displayName || 'Usuario',
        authorPhoto: currentUserProfile?.photoURL || user.photoURL || null,
        content: this.newPostContent(),
        images: images.length > 0 ? images : undefined,
        video: videoUrl
      });

      this.closeCreatePostModal();
      this.loadPosts(this.userId()!);
      // Navegar al blog después de crear
      this.router.navigate(['/blog']);
    } catch (error) {
      console.error('Error creating post:', error);
      alert('Error al crear la publicación. Por favor intenta nuevamente.');
    } finally {
      this.uploadingPost.set(false);
    }
  }

  onPostImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.newPostImages.set(Array.from(input.files));
    }
  }

  onPostVideoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.newPostVideo.set(input.files[0]);
    }
  }

  removePostImage(index: number) {
    const current = this.newPostImages();
    const fileToRemove = current[index];
    if (fileToRemove && this.imagePreviewCache.has(fileToRemove)) {
      const url = this.imagePreviewCache.get(fileToRemove);
      if (url) {
        URL.revokeObjectURL(url);
        this.previewUrls = this.previewUrls.filter((u: string) => u !== url);
      }
      this.imagePreviewCache.delete(fileToRemove);
    }
    this.newPostImages.set(current.filter((_, i) => i !== index));
  }

  getImagePreview(file: File): string {
    if (this.imagePreviewCache.has(file)) {
      return this.imagePreviewCache.get(file)!;
    }
    const url = URL.createObjectURL(file);
    this.imagePreviewCache.set(file, url);
    this.previewUrls.push(url);
    return url;
  }

  getVideoPreview(file: File): string {
    if (this.videoPreviewCache.has(file)) {
      return this.videoPreviewCache.get(file)!;
    }
    const url = URL.createObjectURL(file);
    this.videoPreviewCache.set(file, url);
    this.previewUrls.push(url);
    return url;
  }

  removePostVideo() {
    const video = this.newPostVideo();
    if (video && this.videoPreviewCache.has(video)) {
      const url = this.videoPreviewCache.get(video);
      if (url) {
        URL.revokeObjectURL(url);
        this.previewUrls = this.previewUrls.filter((u: string) => u !== url);
      }
      this.videoPreviewCache.delete(video);
    }
    this.newPostVideo.set(null);
  }

  cleanupPreviewUrls() {
    this.previewUrls.forEach((url: string) => URL.revokeObjectURL(url));
    this.previewUrls = [];
    this.imagePreviewCache.forEach((url: string) => URL.revokeObjectURL(url));
    this.imagePreviewCache.clear();
    this.videoPreviewCache.forEach((url: string) => URL.revokeObjectURL(url));
    this.videoPreviewCache.clear();
  }

  getTextSizeClass(content: string): string {
    const length = content.length;
    if (length <= 30) {
      return 'text-short';
    } else if (length <= 100) {
      return 'text-medium';
    } else if (length <= 300) {
      return 'text-long';
    } else {
      return 'text-very-long';
    }
  }

  // Suscribirse a cambios en tiempo real del perfil
  subscribeToProfileRealtime(userId: string) {
    // Limpiar suscripción anterior si existe
    if (this.profileSubscription) {
      this.profileSubscription.unsubscribe();
    }

    // Suscribirse a cambios en tiempo real usando el método del servicio
    this.profileSubscription = this.firebaseService.getUserProfileRealtime(userId).subscribe({
      next: (updatedProfile) => {
        if (updatedProfile) {
          this.profile.set(updatedProfile);
          writeCachedUserProfile(userId, updatedProfile);
        }
      },
      error: (error) => {
        console.error('Error en suscripción de perfil en tiempo real:', error);
      }
    });
  }

  ngOnDestroy() {
    // Limpiar suscripción cuando el componente se destruya
    if (this.profileSubscription) {
      this.profileSubscription.unsubscribe();
      this.profileSubscription = null;
    }
  }
}

