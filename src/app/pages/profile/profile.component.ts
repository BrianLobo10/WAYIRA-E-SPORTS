import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FirebaseService, UserProfile, Post, Comment } from '../../services/firebase.service';
import { RiotApiService, SummonerData } from '../../services/riot-api.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  // Exponer URL global para usar en el template
  URL = URL;
  private firebaseService = inject(FirebaseService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

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
  foundSummoner = signal<SummonerData | null>(null);
  searchingSummoner = signal(false);
  summonerError = signal<string | null>(null);

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
    'Aatrox', 'Ahri', 'Akali', 'Akshan', 'Alistar', 'Amumu', 'Anivia', 'Annie', 'Aphelios', 'Ashe',
    'Aurelion Sol', 'Azir', 'Bard', 'Bel\'Veth', 'Blitzcrank', 'Brand', 'Braum', 'Caitlyn', 'Camille', 'Cassiopeia',
    'Cho\'Gath', 'Corki', 'Darius', 'Diana', 'Draven', 'Dr. Mundo', 'Ekko', 'Elise', 'Evelynn', 'Ezreal',
    'Fiddlesticks', 'Fiora', 'Fizz', 'Galio', 'Gangplank', 'Garen', 'Gnar', 'Gragas', 'Graves', 'Gwen',
    'Hecarim', 'Heimerdinger', 'Hwei', 'Illaoi', 'Irelia', 'Ivern', 'Janna', 'Jarvan IV', 'Jax', 'Jayce',
    'Jhin', 'Jinx', 'K\'Sante', 'Kai\'Sa', 'Kalista', 'Karma', 'Karthus', 'Kassadin', 'Katarina', 'Kayle',
    'Kayn', 'Kennen', 'Kha\'Zix', 'Kindred', 'Kled', 'Kog\'Maw', 'LeBlanc', 'Lee Sin', 'Leona', 'Lillia',
    'Lissandra', 'Lucian', 'Lulu', 'Lux', 'Malphite', 'Malzahar', 'Maokai', 'Master Yi', 'Milio', 'Miss Fortune',
    'Mordekaiser', 'Morgana', 'Naafiri', 'Nami', 'Nasus', 'Nautilus', 'Neeko', 'Nidalee', 'Nilah', 'Nocturne',
    'Nunu & Willump', 'Olaf', 'Orianna', 'Ornn', 'Pantheon', 'Poppy', 'Pyke', 'Qiyana', 'Quinn', 'Rakan',
    'Rammus', 'Rek\'Sai', 'Rell', 'Renata Glasc', 'Renekton', 'Rengar', 'Riven', 'Rumble', 'Ryze', 'Samira',
    'Sejuani', 'Senna', 'Seraphine', 'Sett', 'Shaco', 'Shen', 'Shyvana', 'Singed', 'Sion', 'Sivir',
    'Skarner', 'Sona', 'Soraka', 'Swain', 'Sylas', 'Syndra', 'Tahm Kench', 'Taliyah', 'Talon', 'Taric',
    'Teemo', 'Thresh', 'Tristana', 'Trundle', 'Tryndamere', 'Twisted Fate', 'Twitch', 'Udyr', 'Urgot', 'Varus',
    'Vayne', 'Veigar', 'Vel\'Koz', 'Vex', 'Vi', 'Viego', 'Viktor', 'Vladimir', 'Volibear', 'Warwick',
    'Xayah', 'Xerath', 'Xin Zhao', 'Yasuo', 'Yone', 'Yorick', 'Yuumi', 'Zac', 'Zed', 'Zeri', 'Ziggs', 'Zilean', 'Zoe', 'Zyra'
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
    this.loading.set(true);
    try {
      const profile = await this.firebaseService.getUserProfile(userId);
      this.profile.set(profile);
      
      const currentUser = this.firebaseService.getCurrentUser();
      if (currentUser && profile) {
        // Verificar si el usuario actual está siguiendo al perfil objetivo
        // Debemos verificar el 'following' del usuario actual, no los 'followers' del perfil objetivo
        const currentUserProfile = await this.firebaseService.getUserProfile(currentUser.uid);
        if (currentUserProfile) {
          const following = currentUserProfile.following || [];
          const isFollowingUser = following.includes(userId);
          this.isFollowing.set(isFollowingUser);
          console.log('Estado de seguimiento cargado:', isFollowingUser, 'Siguiendo:', following);
        }
      }
    } catch (error) {
      console.error('Error cargando perfil:', error);
    } finally {
      this.loading.set(false);
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
      const profile = await this.firebaseService.getUserProfile(currentUser.uid);
      this.currentUserProfile.set(profile);
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
      }
      
      if (updatedCurrentUserProfile) {
        this.currentUserProfile.set(updatedCurrentUserProfile);
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

  openEditModal() {
    const profile = this.profile();
    if (profile) {
      this.editDisplayName.set(profile.displayName);
      this.editBio.set(profile.bio || '');
      this.editPhotoPreview.set(profile.photoURL || null);
      this.filteredChampions.set(this.champions);
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
}

