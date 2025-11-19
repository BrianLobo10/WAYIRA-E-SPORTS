import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FirebaseService, Post, Comment, UserProfile } from '../../../services/firebase.service';
import { User } from '@angular/fire/auth';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-post-view',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './post-view.component.html',
  styleUrls: ['./post-view.component.css']
})
export class PostViewComponent implements OnInit, OnDestroy {
  private firebaseService = inject(FirebaseService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  
  post = signal<Post | null>(null);
  currentUser = signal<UserProfile | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  
  postImageIndex = signal(0);
  newComment = signal('');
  replyingToComment = signal<number | null>(null);
  replyCommentText = signal<Map<number, string>>(new Map());
  
  private postSubscription?: Subscription;
  private userSubscription?: Subscription;

  ngOnInit() {
    this.route.params.subscribe(params => {
      const postId = params['id'];
      if (postId) {
        this.loadPost(postId);
      } else {
        this.error.set('ID de publicación no válido');
        this.loading.set(false);
      }
    });

    // Cargar perfil del usuario actual
    this.userSubscription = this.firebaseService.currentUser.subscribe((user: User | null) => {
      if (user) {
        this.loadUserProfile(user);
      }
    });
  }

  ngOnDestroy() {
    this.postSubscription?.unsubscribe();
    this.userSubscription?.unsubscribe();
  }

  private async loadUserProfile(user: User) {
    try {
      const profile = await this.firebaseService.getUserProfile(user.uid);
      this.currentUser.set(profile);
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  }

  loadPost(postId: string) {
    this.loading.set(true);
    this.error.set(null);
    
    this.postSubscription?.unsubscribe();
    this.postSubscription = this.firebaseService.getPostById(postId).subscribe({
      next: (post) => {
        if (post) {
          this.post.set(post);
          this.loading.set(false);
        } else {
          this.error.set('Publicación no encontrada');
          this.loading.set(false);
        }
      },
      error: (error) => {
        console.error('Error loading post:', error);
        this.error.set('Error al cargar la publicación');
        this.loading.set(false);
      }
    });
  }

  async likePost() {
    const post = this.post();
    const user = this.firebaseService.getCurrentUser();
    if (!user || !post?.id) return;
    await this.firebaseService.likePost(post.id, user.uid);
  }

  async dislikePost() {
    const post = this.post();
    const user = this.firebaseService.getCurrentUser();
    if (!user || !post?.id) return;
    await this.firebaseService.dislikePost(post.id, user.uid);
  }

  isLiked(): boolean {
    const post = this.post();
    const user = this.firebaseService.getCurrentUser();
    return user && post ? (post.likes || []).includes(user.uid) : false;
  }

  isDisliked(): boolean {
    const post = this.post();
    const user = this.firebaseService.getCurrentUser();
    return user && post ? (post.dislikes || []).includes(user.uid) : false;
  }

  async addComment(commentIndex?: number) {
    const user = this.firebaseService.getCurrentUser();
    const post = this.post();
    if (!user || !post?.id) return;

    const commentText = commentIndex !== undefined 
      ? this.replyCommentText().get(commentIndex)?.trim() 
      : this.newComment().trim();

    if (!commentText) return;

    try {
      await this.firebaseService.addComment(post.id, {
        authorId: user.uid,
        authorName: this.currentUser()?.displayName || user.displayName || 'Usuario',
        authorPhoto: this.currentUser()?.photoURL || user.photoURL || null,
        content: commentText
      }, commentIndex);

      // Limpiar inputs
      if (commentIndex !== undefined) {
        const replyMap = new Map(this.replyCommentText());
        replyMap.delete(commentIndex);
        this.replyCommentText.set(replyMap);
        this.replyingToComment.set(null);
      } else {
        this.newComment.set('');
      }
    } catch (error) {
      console.error('Error agregando comentario:', error);
      alert('Error al agregar el comentario. Por favor intenta nuevamente.');
    }
  }

  async likeComment(commentIndex: number, replyIndex?: number) {
    const user = this.firebaseService.getCurrentUser();
    const post = this.post();
    if (!user || !post?.id) return;
    try {
      await this.firebaseService.likeComment(post.id, commentIndex, user.uid, replyIndex);
    } catch (error) {
      console.error('Error dando like al comentario:', error);
    }
  }

  async dislikeComment(commentIndex: number, replyIndex?: number) {
    const user = this.firebaseService.getCurrentUser();
    const post = this.post();
    if (!user || !post?.id) return;
    try {
      await this.firebaseService.dislikeComment(post.id, commentIndex, user.uid, replyIndex);
    } catch (error) {
      console.error('Error dando dislike al comentario:', error);
    }
  }

  toggleReply(commentIndex: number) {
    if (this.replyingToComment() === commentIndex) {
      this.replyingToComment.set(null);
      const replyMap = new Map(this.replyCommentText());
      replyMap.delete(commentIndex);
      this.replyCommentText.set(replyMap);
    } else {
      this.replyingToComment.set(commentIndex);
      const replyMap = new Map(this.replyCommentText());
      if (!replyMap.has(commentIndex)) {
        replyMap.set(commentIndex, '');
      }
      this.replyCommentText.set(replyMap);
    }
  }

  setReplyText(commentIndex: number, text: string) {
    const replyMap = new Map(this.replyCommentText());
    replyMap.set(commentIndex, text);
    this.replyCommentText.set(replyMap);
  }

  nextImage() {
    const post = this.post();
    if (!post?.images || post.images.length <= 1) return;
    const currentIndex = this.postImageIndex();
    const nextIndex = (currentIndex + 1) % post.images.length;
    this.postImageIndex.set(nextIndex);
  }

  prevImage() {
    const post = this.post();
    if (!post?.images || post.images.length <= 1) return;
    const currentIndex = this.postImageIndex();
    const prevIndex = (currentIndex - 1 + post.images.length) % post.images.length;
    this.postImageIndex.set(prevIndex);
  }

  goToImage(index: number) {
    this.postImageIndex.set(index);
  }

  getCurrentImageIndex(): number {
    return this.postImageIndex();
  }

  goBack() {
    this.router.navigate(['/blog']);
  }

  formatDate(timestamp: any): string {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('es-ES', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
}

