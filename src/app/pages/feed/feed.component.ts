import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FirebaseService, Post, UserProfile } from '../../services/firebase.service';
import { User } from '@angular/fire/auth';
import { Subscription } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-feed',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './feed.component.html',
  styleUrls: ['./feed.component.css']
})
export class FeedComponent implements OnInit, OnDestroy {
  private firebaseService = inject(FirebaseService);
  private userSub?: Subscription;
  private postsSub?: Subscription;
  private suggestedSub?: Subscription;
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

  ngOnInit() {
    this.userSub = this.firebaseService.currentUser.subscribe((user: User | null) => {
      if (user) {
        this.isAuthenticated.set(true);
        this.loadUserProfile(user);
        this.loadPosts();
        this.loadSuggestedUsers(user.uid);
      } else {
        this.isAuthenticated.set(false);
        this.posts.set([]);
        this.currentUser.set(null);
        this.suggestedUsers.set([]);
        this.loading.set(false);
      }
    });
  }

  private async loadUserProfile(user: User) {
    try {
      const profile = await this.firebaseService.getUserProfile(user.uid);
      if (profile) {
        this.currentUser.set({
          ...profile,
          photoURL: profile.photoURL || user.photoURL || undefined
        });
        return;
      }
      this.currentUser.set({
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'Usuario',
        photoURL: user.photoURL || undefined,
        role: 'user',
        followers: [],
        following: [],
        createdAt: Timestamp.now()
      });
    } catch {
      this.currentUser.set({
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'Usuario',
        photoURL: user.photoURL || undefined,
        role: 'user',
        followers: [],
        following: [],
        createdAt: Timestamp.now()
      });
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
    this.userSub?.unsubscribe();
    this.postsSub?.unsubscribe();
    this.suggestedSub?.unsubscribe();
  }

  loadPosts() {
    const user = this.firebaseService.getCurrentUser();
    if (!user) {
      this.posts.set([]);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.postsSub = this.firebaseService.getPosts(50).subscribe({
      next: (posts) => {
        this.posts.set(posts);
        this.loading.set(false);
      },
      error: () => {
        this.posts.set([]);
        this.loading.set(false);
      }
    });
  }

  loadSuggestedUsers(currentUserId: string) {
    this.suggestedSub = this.firebaseService.getSuggestedUsers(currentUserId, 6).subscribe({
      next: (users) => this.suggestedUsers.set(users)
    });
  }

  async followUser(targetUserId: string) {
    const user = this.firebaseService.getCurrentUser();
    if (!user) return;
    try {
      await this.firebaseService.followUser(user.uid, targetUserId);
      this.loadUserProfile(user);
      this.suggestedUsers.update(list => list.filter(u => u.uid !== targetUserId));
    } catch (e) {
      console.error(e);
    }
  }

  async createPost() {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !this.newPostContent().trim()) {
      if (!this.newPostContent().trim()) alert('Escribe algo para publicar');
      return;
    }
    this.uploading.set(true);
    try {
      let authorName = this.currentUser()?.displayName || user.displayName || 'Usuario';
      let authorPhoto = this.currentUser()?.photoURL || user.photoURL || null;
      const postId = `post_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const images: string[] = [];
      for (const file of this.newPostImages()) {
        const url = await this.firebaseService.uploadImage(file, `posts/${user.uid}/${postId}/${file.name}`);
        images.push(url);
      }
      let video: string | null = null;
      if (this.newPostVideo()) {
        video = await this.firebaseService.uploadVideo(this.newPostVideo()!, `posts/${user.uid}/${postId}/${this.newPostVideo()!.name}`);
      }
      const postData: any = {
        authorId: user.uid,
        authorName,
        authorPhoto,
        content: this.newPostContent().trim()
      };
      if (images.length) postData.images = images;
      if (video) postData.video = video;
      await this.firebaseService.createPost(postData);
      this.newPostContent.set('');
      this.cleanupPreviewUrls();
      this.newPostImages.set([]);
      this.newPostVideo.set(null);
      this.showCreateModal.set(false);
      this.loadPosts();
    } catch (err: any) {
      alert(err?.message || 'Error al publicar');
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
    const user = this.firebaseService.getCurrentUser();
    if (!user || this.isLiked(post)) return;
    await this.firebaseService.likePost(post.id!, user.uid);
    this.refreshSelectedPost();
    this.loadPosts();
  }
  async dislikePost(post: Post, e?: Event) {
    e?.stopPropagation();
    const user = this.firebaseService.getCurrentUser();
    if (!user || this.isDisliked(post)) return;
    await this.firebaseService.dislikePost(post.id!, user.uid);
    this.refreshSelectedPost();
    this.loadPosts();
  }
  isLiked(post: Post): boolean {
    const user = this.firebaseService.getCurrentUser();
    return !!(user && (post.likes || []).includes(user.uid));
  }
  isDisliked(post: Post): boolean {
    const user = this.firebaseService.getCurrentUser();
    return !!(user && (post.dislikes || []).includes(user.uid));
  }

  openPost(post: Post) {
    this.selectedPost.set(post);
    this.showPostModal.set(true);
    this.firebaseService.getPostById(post.id!).subscribe({
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
      this.firebaseService.getPostById(post.id).subscribe({
        next: (p) => p && this.selectedPost.set(p)
      });
    }
  }
  async addComment() {
    const post = this.selectedPost();
    const user = this.firebaseService.getCurrentUser();
    if (!user || !post?.id || !this.newComment().trim()) return;
    await this.firebaseService.addComment(post.id, {
      authorId: user.uid,
      authorName: this.currentUser()?.displayName || user.displayName || 'Usuario',
      authorPhoto: this.currentUser()?.photoURL || user.photoURL || null,
      content: this.newComment().trim()
    });
    this.newComment.set('');
    this.refreshSelectedPost();
    this.loadPosts();
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
