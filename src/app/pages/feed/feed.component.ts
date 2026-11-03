import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Post, UserProfile } from '../../models';
import { CommunityService } from '../../services/community.service';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-feed',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './feed.component.html',
  styleUrls: ['./feed.component.css']
})
export class FeedComponent implements OnInit, OnDestroy {
  private community = inject(CommunityService);
  private auth = inject(AuthService);
  private postsSub?: Subscription;
  private suggestedSub?: Subscription;
  private stopWatching?: () => void;
  private previewUrls: string[] = [];
  private imagePreviewCache = new Map<File, string>();
  private videoPreviewCache = new Map<File, string>();

  posts = signal<Post[]>([]);
  currentUser = signal<UserProfile | null>(null);
  suggestedUsers = signal<UserProfile[]>([]);
  loading = signal(true);
  isAuthenticated = signal(false);
  postImageIndices = signal<Map<string, number>>(new Map());

  showCreateModal = signal(false);
  newPostContent = signal('');
  newPostImages = signal<File[]>([]);
  newPostVideo = signal<File | null>(null);
  uploading = signal(false);

  selectedPost = signal<Post | null>(null);
  showPostModal = signal(false);
  newComment = signal('');
  activeTab = signal<'all' | 'following'>('all');

  async ngOnInit() {
    // La ruta ya exige sesión; aquí solo esperamos a que Supabase la tenga lista
    await this.auth.waitForInit();
    const user = this.community.getCurrentUser();
    if (!user) {
      this.isAuthenticated.set(false);
      this.loading.set(false);
      return;
    }
    this.isAuthenticated.set(true);
    void this.loadUserProfile(user.uid);
    this.loadPosts();
    this.loadSuggestedUsers(user.uid);
    // Publicaciones, comentarios y reacciones nuevas aparecen solas
    this.stopWatching = this.community.watchCommunity(() => {
      this.loadPosts(false);
      this.refreshSelectedPost();
    });
  }

  private async loadUserProfile(uid: string) {
    try {
      this.currentUser.set(await this.community.getUserProfile(uid));
    } catch (err) {
      console.error('No se pudo cargar tu perfil', err);
    }
  }

  onAvatarError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.onerror = null;
    img.src = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/29.png';
  }

  ngOnDestroy() {
    this.previewUrls.forEach(url => URL.revokeObjectURL(url));
    this.imagePreviewCache.forEach(url => URL.revokeObjectURL(url));
    this.videoPreviewCache.forEach(url => URL.revokeObjectURL(url));
    this.stopWatching?.();
    this.postsSub?.unsubscribe();
    this.suggestedSub?.unsubscribe();
  }

  /** Carga las últimas 50 publicaciones. Sin indicador de carga cuando es una actualización en segundo plano. */
  loadPosts(showLoading = true) {
    if (!this.community.getCurrentUser()) {
      this.posts.set([]);
      this.loading.set(false);
      return;
    }
    if (showLoading) this.loading.set(true);
    this.postsSub?.unsubscribe();
    this.postsSub = this.community.getPosts(50).subscribe({
      next: (posts) => {
        this.posts.set(posts);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('No se pudieron cargar las publicaciones', err);
        this.loading.set(false);
      }
    });
  }

  loadSuggestedUsers(currentUserId: string) {
    this.suggestedSub = this.community.getSuggestedUsers(currentUserId, 6).subscribe({
      next: (users) => this.suggestedUsers.set(users)
    });
  }

  async followUser(targetUserId: string) {
    const user = this.community.getCurrentUser();
    if (!user) return;
    try {
      await this.community.followUser(user.uid, targetUserId);
      void this.loadUserProfile(user.uid);
      this.suggestedUsers.update(list => list.filter(u => u.uid !== targetUserId));
    } catch (e) {
      console.error(e);
    }
  }

  async createPost() {
    const user = this.community.getCurrentUser();
    if (!user || !this.newPostContent().trim()) {
      if (!this.newPostContent().trim()) alert('Escribe algo para publicar');
      return;
    }
    this.uploading.set(true);
    try {
      const images: string[] = [];
      for (const file of this.newPostImages()) {
        images.push(await this.community.uploadImage(file, 'post-media'));
      }
      const video = this.newPostVideo() ? await this.community.uploadVideo(this.newPostVideo()!) : undefined;
      await this.community.createPost({
        authorId: user.uid,
        content: this.newPostContent().trim(),
        images,
        video
      });
      this.newPostContent.set('');
      this.cleanupPreviewUrls();
      this.newPostImages.set([]);
      this.newPostVideo.set(null);
      this.showCreateModal.set(false);
      this.loadPosts();
    } catch (err: any) {
      console.error(err);
      alert('No se pudo publicar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      this.uploading.set(false);
    }
  }

  private cleanupPreviewUrls() {
    this.imagePreviewCache.forEach(url => URL.revokeObjectURL(url));
    this.imagePreviewCache.clear();
    this.videoPreviewCache.forEach(url => URL.revokeObjectURL(url));
    this.videoPreviewCache.clear();
  }

  onImageSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) this.newPostImages.set([...this.newPostImages(), ...Array.from(input.files)]);
  }
  onVideoSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) this.newPostVideo.set(input.files[0]);
  }
  removeImage(i: number) {
    this.newPostImages.update(imgs => imgs.filter((_, idx) => idx !== i));
  }
  removeVideo() {
    this.newPostVideo.set(null);
  }
  getImagePreview(file: File): string {
    if (this.imagePreviewCache.has(file)) return this.imagePreviewCache.get(file)!;
    const url = URL.createObjectURL(file);
    this.previewUrls.push(url);
    this.imagePreviewCache.set(file, url);
    return url;
  }
  getVideoPreview(file: File): string {
    if (this.videoPreviewCache.has(file)) return this.videoPreviewCache.get(file)!;
    const url = URL.createObjectURL(file);
    this.previewUrls.push(url);
    this.videoPreviewCache.set(file, url);
    return url;
  }

  async likePost(post: Post, e?: Event) {
    e?.stopPropagation();
    const user = this.community.getCurrentUser();
    if (!user || !post.id) return;
    this.applyReaction(post, user.uid, 'like');
    await this.community.likePost(post.id, user.uid).catch((err) => console.error(err));
    this.refreshSelectedPost();
    this.loadPosts(false);
  }
  async dislikePost(post: Post, e?: Event) {
    e?.stopPropagation();
    const user = this.community.getCurrentUser();
    if (!user || !post.id) return;
    this.applyReaction(post, user.uid, 'dislike');
    await this.community.dislikePost(post.id, user.uid).catch((err) => console.error(err));
    this.refreshSelectedPost();
    this.loadPosts(false);
  }
  /** Actualiza el contador al instante, sin esperar al servidor. */
  private applyReaction(post: Post, uid: string, kind: 'like' | 'dislike') {
    const had = kind === 'like' ? post.likes.includes(uid) : (post.dislikes ?? []).includes(uid);
    const likes = post.likes.filter((id) => id !== uid);
    const dislikes = (post.dislikes ?? []).filter((id) => id !== uid);
    if (!had) (kind === 'like' ? likes : dislikes).push(uid);
    const patch = (p: Post) => (p.id === post.id ? { ...p, likes, dislikes } : p);
    this.posts.update((list) => list.map(patch));
    this.selectedPost.update((p) => (p ? patch(p) : p));
  }

  isLiked(post: Post): boolean {
    const user = this.community.getCurrentUser();
    return !!(user && (post.likes || []).includes(user.uid));
  }
  isDisliked(post: Post): boolean {
    const user = this.community.getCurrentUser();
    return !!(user && (post.dislikes || []).includes(user.uid));
  }

  openPost(post: Post) {
    this.selectedPost.set(post);
    this.showPostModal.set(true);
    this.community.getPostById(post.id!).subscribe({
      next: (p) => p && this.selectedPost.set(p)
    });
  }
  closePostModal() {
    this.showPostModal.set(false);
    this.selectedPost.set(null);
    this.newComment.set('');
  }
  private refreshSelectedPost() {
    const post = this.selectedPost();
    if (post?.id) {
      this.community.getPostById(post.id).subscribe({
        next: (p) => p && this.selectedPost.set(p)
      });
    }
  }
  async addComment() {
    const post = this.selectedPost();
    const user = this.community.getCurrentUser();
    if (!user || !post?.id || !this.newComment().trim()) return;
    try {
      await this.community.addComment(post.id, { authorId: user.uid, content: this.newComment().trim() });
      this.newComment.set('');
      this.refreshSelectedPost();
      this.loadPosts(false);
    } catch (err) {
      console.error(err);
      alert('No se pudo enviar el comentario. Intenta de nuevo.');
    }
  }

  getCurrentImageIndex(postId: string): number {
    return this.postImageIndices().get(postId) ?? 0;
  }

  getCurrentPostImageUrl(post: Post): string | null {
    const imgs = post.images;
    if (!imgs?.length) return null;
    const idx = this.getCurrentImageIndex(post.id || '');
    return imgs[idx] ?? imgs[0] ?? null;
  }
  nextImage(post: Post, e: Event) {
    e.stopPropagation();
    const idx = this.getCurrentImageIndex(post.id!);
    const next = (idx + 1) % (post.images?.length || 1);
    this.postImageIndices.update(m => new Map(m).set(post.id!, next));
  }
  prevImage(post: Post, e: Event) {
    e.stopPropagation();
    const len = post.images?.length || 1;
    const idx = this.getCurrentImageIndex(post.id!);
    const next = (idx - 1 + len) % len;
    this.postImageIndices.update(m => new Map(m).set(post.id!, next));
  }
  goToImage(post: Post, index: number, e: Event) {
    e.stopPropagation();
    this.postImageIndices.update(m => new Map(m).set(post.id!, index));
  }

  formatDate(ts: any): string {
    if (!ts?.toDate) return '';
    const d = ts.toDate();
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Ahora';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' min';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' h';
    return d.toLocaleDateString();
  }

  /** Posts a mostrar según la pestaña: "Para ti" = todos, "Sigues" = solo de usuarios que sigues */
  displayedPosts(): Post[] {
    const list = this.posts();
    if (this.activeTab() === 'following') {
      const following = this.currentUser()?.following ?? [];
      if (following.length === 0) return [];
      return list.filter(p => following.includes(p.authorId));
    }
    return list;
  }

  /** Params para "Tu registro de juego": lleva a buscar jugador con el vinculado al usuario */
  getGameLogParams(): { region?: string; gameName?: string; tagLine?: string } {
    const p = this.currentUser();
    if (!p?.gameName || !p?.tagLine) return {};
    return { region: p.region || 'la1', gameName: p.gameName, tagLine: p.tagLine };
  }

  getHandle(profile: UserProfile | null): string {
    const name = profile?.displayName || profile?.email?.split('@')[0] || 'user';
    return '@' + name.replace(/\s+/g, '').toLowerCase().slice(0, 12);
  }

  copyInviteLink() {
    const user = this.currentUser();
    const url = user?.uid ? `${window.location.origin}/profile/${user.uid}` : window.location.origin;
    navigator.clipboard.writeText(url).then(() => alert('Link de tu perfil copiado al portapapeles'));
  }
}
