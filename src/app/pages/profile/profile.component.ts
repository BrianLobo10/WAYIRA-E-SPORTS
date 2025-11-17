import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FirebaseService, UserProfile, Post } from '../../services/firebase.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
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
    const profile = await this.firebaseService.getUserProfile(userId);
    this.profile.set(profile);
    
    const currentUser = this.firebaseService.getCurrentUser();
    if (currentUser && profile) {
      this.isFollowing.set((profile.followers || []).includes(currentUser.uid));
    }
    this.loading.set(false);
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

    if (this.isFollowing()) {
      await this.firebaseService.unfollowUser(currentUser.uid, profile.uid);
      this.isFollowing.set(false);
    } else {
      await this.firebaseService.followUser(currentUser.uid, profile.uid);
      this.isFollowing.set(true);
    }
    this.loadProfile(profile.uid);
  }

  openPost(post: Post) {
    this.selectedPost.set(post);
    this.showPostModal.set(true);
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

  getPostsCount(): number {
    return this.posts().length;
  }
}

