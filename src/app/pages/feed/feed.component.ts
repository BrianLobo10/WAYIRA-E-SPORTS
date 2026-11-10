import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Post, UserProfile } from '../../models';
import { CommunityService } from '../../services/community.service';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { ToastService } from '../../services/toast.service';
import { PostCardComponent } from '../../components/social/post-card.component';
import { PostDetailComponent } from '../../components/social/post-detail.component';
import { PostEditorComponent } from '../../components/social/post-editor.component';

@Component({
  selector: 'app-feed',
  standalone: true,
  imports: [CommonModule, RouterLink, PostCardComponent, PostDetailComponent, PostEditorComponent],
  templateUrl: './feed.component.html',
  styleUrls: ['./feed.component.css']
})
export class FeedComponent implements OnInit, OnDestroy {
  private readonly toast = inject(ToastService);
  private community = inject(CommunityService);
  private auth = inject(AuthService);
  private postsSub?: Subscription;
  private suggestedSub?: Subscription;
  private stopWatching?: () => void;
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private urlSub?: Subscription;

  posts = signal<Post[]>([]);
  currentUser = signal<UserProfile | null>(null);
  suggestedUsers = signal<UserProfile[]>([]);
  loading = signal(true);
  isAuthenticated = signal(false);
  savedIds = signal<Set<string>>(new Set());
  showCreateModal = signal(false);
  selectedPost = signal<Post | null>(null);
  userId = signal<string | null>(null);
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
    this.userId.set(user.uid);
    void this.loadUserProfile(user.uid);
    this.community.getSavedPostIds().then((s) => this.savedIds.set(s)).catch(() => { /* sin guardados */ });
    this.urlSub = this.route.queryParamMap.subscribe((q) => this.openFromUrl(q.get('post')));
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
    this.urlSub?.unsubscribe();
    if (this.selectedPost()) document.body.style.overflow = '';
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

  /** Abre una publicación y deja su enlace en la barra (?post=id) para poder compartirla */
  openPost(post: Post) {
    if (!post.id) return;
    this.selectedPost.set(post);
    void this.router.navigate([], { queryParams: { post: post.id }, queryParamsHandling: 'merge', replaceUrl: !!this.route.snapshot.queryParamMap.get('post') });
    this.refreshSelectedPost();
  }

  closePostModal() {
    this.selectedPost.set(null);
    void this.router.navigate([], { queryParams: { post: null }, queryParamsHandling: 'merge' });
  }

  private openFromUrl(id: string | null) {
    if (!id) { this.selectedPost.set(null); return; }
    if (this.selectedPost()?.id === id) return;
    const local = this.posts().find((p) => p.id === id);
    if (local) this.selectedPost.set(local);
    this.community.getPostById(id).subscribe({
      next: (p) => {
        if (p) this.selectedPost.set(p);
        else if (!local) { this.toast.error('Esa publicación ya no existe', 'Puede que su autor la haya eliminado.'); this.closePostModal(); }
      },
    });
  }

  private refreshSelectedPost() {
    const id = this.selectedPost()?.id;
    if (!id) return;
    this.community.getPostById(id).subscribe({ next: (p) => p && this.selectedPost()?.id === id && this.selectedPost.set(p) });
  }

  /** Tras editar, comentar o reaccionar: recarga en segundo plano */
  onChanged() {
    this.loadPosts(false);
    this.refreshSelectedPost();
  }

  onDeleted(id: string) {
    this.posts.update((l) => l.filter((p) => p.id !== id));
    this.savedIds.update((s) => { const n = new Set(s); n.delete(id); return n; });
    if (this.selectedPost()?.id === id) this.closePostModal();
  }

  isSaved(id: string | undefined) { return !!id && this.savedIds().has(id); }
  setSavedLocal(id: string | undefined, saved: boolean) {
    if (!id) return;
    this.savedIds.update((s) => { const n = new Set(s); saved ? n.add(id) : n.delete(id); return n; });
  }

  onCreated() {
    this.showCreateModal.set(false);
    this.loadPosts(false);
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
    navigator.clipboard.writeText(url).then(() => this.toast.notify('Link de tu perfil copiado al portapapeles'));
  }
}
