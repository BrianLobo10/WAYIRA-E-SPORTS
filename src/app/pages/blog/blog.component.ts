import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FirebaseService, Post, Comment, UserProfile } from '../../services/firebase.service';
import { User } from '@angular/fire/auth';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-blog',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './blog.component.html',
  styleUrls: ['./blog.component.css']
})
export class BlogComponent implements OnInit, OnDestroy {
  private firebaseService = inject(FirebaseService);
  private userSubscription?: Subscription;
  private postsSubscription?: Subscription;
  private previewUrls: string[] = [];
  private imagePreviewCache = new Map<File, string>();
  private videoPreviewCache = new Map<File, string>();
  
  posts = signal<Post[]>([]);
  currentUser = signal<UserProfile | null>(null);
  loading = signal(true);
  
  // Create post
  showCreateModal = signal(false);
  newPostContent = signal('');
  newPostImages = signal<File[]>([]);
  newPostVideo = signal<File | null>(null);
  uploading = signal(false);

  // View post
  selectedPost = signal<Post | null>(null);
  showPostModal = signal(false);
  newComment = signal('');

  ngOnInit() {
    this.loadPosts();
    this.subscribeToUser();
  }

  ngOnDestroy() {
    // Limpiar URLs de objetos para evitar fugas de memoria
    this.previewUrls.forEach(url => URL.revokeObjectURL(url));
    this.previewUrls = [];
    this.imagePreviewCache.forEach(url => URL.revokeObjectURL(url));
    this.imagePreviewCache.clear();
    this.videoPreviewCache.forEach(url => URL.revokeObjectURL(url));
    this.videoPreviewCache.clear();
    this.userSubscription?.unsubscribe();
    this.postsSubscription?.unsubscribe();
  }

  loadPosts() {
    this.loading.set(true);
    this.postsSubscription = this.firebaseService.getPosts(50).subscribe({
      next: (posts) => {
        this.posts.set(posts);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Error loading posts:', error);
        this.loading.set(false);
      }
    });
  }

  subscribeToUser() {
    this.userSubscription = this.firebaseService.currentUser.subscribe(async (user: User | null) => {
      if (user) {
        const profile = await this.firebaseService.getUserProfile(user.uid);
        this.currentUser.set(profile);
      } else {
        this.currentUser.set(null);
      }
    });
  }

  async createPost() {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !this.currentUser()) return;

    if (!this.newPostContent().trim()) {
      alert('Por favor ingresa contenido para la publicación');
      return;
    }

    this.uploading.set(true);
    try {
      // Generar un ID único para la publicación antes de subir archivos
      const postId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const images: string[] = [];
      let video: string | null = null;

      // Upload images con el ID de la publicación
      for (const file of this.newPostImages()) {
        const fileName = `${postId}_${file.name}`;
        const url = await this.firebaseService.uploadImage(file, `posts/${user.uid}/${postId}/${fileName}`);
        images.push(url);
      }

      // Upload video con el ID de la publicación
      if (this.newPostVideo()) {
        const fileName = `${postId}_${this.newPostVideo()!.name}`;
        video = await this.firebaseService.uploadVideo(this.newPostVideo()!, `posts/${user.uid}/${postId}/${fileName}`);
      }

      // Construir el objeto del post sin campos undefined
      const postData: any = {
        authorId: user.uid,
        authorName: this.currentUser()!.displayName || 'Usuario',
        authorPhoto: this.currentUser()!.photoURL || null,
        content: this.newPostContent().trim()
      };

      // Solo agregar images si hay imágenes
      if (images.length > 0) {
        postData.images = images;
      }

      // Solo agregar video si hay video
      if (video) {
        postData.video = video;
      }

      await this.firebaseService.createPost(postData);

      this.newPostContent.set('');
      this.cleanupPreviewUrls();
      this.newPostImages.set([]);
      this.newPostVideo.set(null);
      this.showCreateModal.set(false);
      this.loadPosts();
    } catch (error: any) {
      console.error('Error creating post:', error);
      alert(error.message || 'Error al crear la publicación. Por favor intenta nuevamente.');
    } finally {
      this.uploading.set(false);
    }
  }

  onImageSelect(event: any) {
    const files = Array.from(event.target.files) as File[];
    this.newPostImages.set([...this.newPostImages(), ...files]);
  }

  onVideoSelect(event: any) {
    const file = event.target.files[0];
    this.newPostVideo.set(file);
  }

  removeImage(index: number) {
    const images = [...this.newPostImages()];
    const removedFile = images[index];
    images.splice(index, 1);
    this.newPostImages.set(images);
    // Limpiar URL del objeto removido
    if (this.imagePreviewCache.has(removedFile)) {
      const url = this.imagePreviewCache.get(removedFile)!;
      URL.revokeObjectURL(url);
      this.imagePreviewCache.delete(removedFile);
      const urlIndex = this.previewUrls.indexOf(url);
      if (urlIndex > -1) {
        this.previewUrls.splice(urlIndex, 1);
      }
    }
  }

  removeVideo() {
    const video = this.newPostVideo();
    if (video && this.videoPreviewCache.has(video)) {
      const url = this.videoPreviewCache.get(video)!;
      URL.revokeObjectURL(url);
      this.videoPreviewCache.delete(video);
      const urlIndex = this.previewUrls.indexOf(url);
      if (urlIndex > -1) {
        this.previewUrls.splice(urlIndex, 1);
      }
    }
    this.newPostVideo.set(null);
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

  cleanupPreviewUrls() {
    this.previewUrls.forEach(url => URL.revokeObjectURL(url));
    this.previewUrls = [];
    this.imagePreviewCache.forEach(url => URL.revokeObjectURL(url));
    this.imagePreviewCache.clear();
    this.videoPreviewCache.forEach(url => URL.revokeObjectURL(url));
    this.videoPreviewCache.clear();
  }

  async likePost(post: Post) {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !post.id) return;
    await this.firebaseService.likePost(post.id, user.uid);
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

  isDisliked(post: Post): boolean {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !post.dislikes) return false;
    return post.dislikes.includes(user.uid);
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

  closeCreateModal() {
    this.cleanupPreviewUrls();
    this.showCreateModal.set(false);
    this.newPostContent.set('');
    this.newPostImages.set([]);
    this.newPostVideo.set(null);
  }

  async addComment() {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !this.selectedPost()?.id || !this.newComment().trim()) return;

    await this.firebaseService.addComment(this.selectedPost()!.id!, {
      authorId: user.uid,
      authorName: this.currentUser()!.displayName,
      authorPhoto: this.currentUser()!.photoURL,
      content: this.newComment()
    });

    this.newComment.set('');
    this.loadPosts();
    const updatedPost = this.posts().find(p => p.id === this.selectedPost()?.id);
    if (updatedPost) {
      this.selectedPost.set(updatedPost);
    }
  }

  async likeComment(commentIndex: number) {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !this.selectedPost()?.id) return;
    await this.firebaseService.likeComment(this.selectedPost()!.id!, commentIndex, user.uid);
    this.loadPosts();
    const updatedPost = this.posts().find(p => p.id === this.selectedPost()?.id);
    if (updatedPost) {
      this.selectedPost.set(updatedPost);
    }
  }

  async dislikeComment(commentIndex: number) {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !this.selectedPost()?.id) return;
    await this.firebaseService.dislikeComment(this.selectedPost()!.id!, commentIndex, user.uid);
    this.loadPosts();
    const updatedPost = this.posts().find(p => p.id === this.selectedPost()?.id);
    if (updatedPost) {
      this.selectedPost.set(updatedPost);
    }
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

  isLiked(post: Post): boolean {
    const user = this.firebaseService.getCurrentUser();
    return user ? (post.likes || []).includes(user.uid) : false;
  }
}

