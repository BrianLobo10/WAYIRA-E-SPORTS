import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FirebaseService, Post, Comment, UserProfile } from '../../services/firebase.service';
import { User } from '@angular/fire/auth';
import { Subscription } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';

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
  isAuthenticated = signal(false);
  
  // Carousel state for each post
  postImageIndices = signal<Map<string, number>>(new Map());
  
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
  replyingToComment = signal<number | null>(null); // Índice del comentario al que se está respondiendo
  replyCommentText = signal<Map<number, string>>(new Map()); // Texto de respuesta por índice de comentario
  private postSubscription?: Subscription; // Suscripción para actualizaciones en tiempo real
  
  // Edit post
  showEditModal = signal(false);
  editingPost = signal<Post | null>(null);
  editPostContent = signal('');
  editPostImages = signal<File[]>([]);
  editPostVideo = signal<File | null>(null);
  existingImages = signal<string[]>([]);
  existingVideo = signal<string | null>(null);
  imagesToDelete = signal<string[]>([]);

  ngOnInit() {
    // Suscribirse al estado de autenticación para cargar posts solo cuando el usuario esté autenticado
    this.userSubscription = this.firebaseService.currentUser.subscribe((user: User | null) => {
      if (user) {
        this.isAuthenticated.set(true);
        // Cargar perfil del usuario
        this.loadUserProfile(user);
        // Solo cargar posts si el usuario está autenticado y no hay una suscripción activa
        if (!this.postsSubscription || this.postsSubscription.closed) {
          this.loadPosts();
        }
      } else {
        this.isAuthenticated.set(false);
        // Si no hay usuario, limpiar posts y perfil
        this.posts.set([]);
        this.currentUser.set(null);
        this.loading.set(false);
      }
    });

  }

  private async loadUserProfile(user: User) {
    try {
      const profile = await this.firebaseService.getUserProfile(user.uid);
      this.currentUser.set(profile);
    } catch (error) {
      console.error('Error loading user profile:', error);
      // Si no se puede cargar el perfil, crear uno básico desde el usuario de auth
      const basicProfile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'Usuario',
        photoURL: user.photoURL || undefined,
        role: 'user',
        createdAt: Timestamp.now()
      };
      this.currentUser.set(basicProfile);
    }
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
    const user = this.firebaseService.getCurrentUser();
    if (!user) {
      console.warn('No se pueden cargar posts: usuario no autenticado');
      this.posts.set([]);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.postsSubscription = this.firebaseService.getPosts(50).subscribe({
      next: (posts) => {
        this.posts.set(posts);
        this.loading.set(false);
      },
      error: (error: any) => {
        console.error('Error loading posts:', error);
        if (error.code === 'permission-denied' || error.message?.includes('permission')) {
          console.error('Error de permisos al cargar posts. Verifica que estés autenticado.');
        }
        this.posts.set([]);
        this.loading.set(false);
      }
    });
  }


  async createPost() {
    const user = this.firebaseService.getCurrentUser();
    if (!user) {
      alert('Debes iniciar sesión para publicar');
      return;
    }

    if (!this.newPostContent().trim()) {
      alert('Por favor ingresa contenido para la publicación');
      return;
    }

    this.uploading.set(true);
    try {
      // Obtener datos del perfil o usar datos básicos del usuario de auth
      let authorName = 'Usuario';
      let authorPhoto: string | null = null;
      
      if (this.currentUser()) {
        authorName = this.currentUser()!.displayName || user.displayName || 'Usuario';
        authorPhoto = this.currentUser()!.photoURL || user.photoURL || null;
      } else {
        // Si no se ha cargado el perfil, usar datos del usuario de auth
        authorName = user.displayName || user.email?.split('@')[0] || 'Usuario';
        authorPhoto = user.photoURL || null;
      }

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
        authorName: authorName,
        authorPhoto: authorPhoto,
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
    if (this.showEditModal()) {
      this.editPostImages.set([...this.editPostImages(), ...files]);
    } else {
      this.newPostImages.set([...this.newPostImages(), ...files]);
    }
  }

  onVideoSelect(event: any) {
    const file = event.target.files[0];
    if (this.showEditModal()) {
      this.editPostVideo.set(file);
    } else {
      this.newPostVideo.set(file);
    }
  }

  removeImage(index: number) {
    if (this.showEditModal()) {
      const images = [...this.editPostImages()];
      const removedFile = images[index];
      images.splice(index, 1);
      this.editPostImages.set(images);
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
    } else {
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
  }

  removeExistingImage(imageUrl: string) {
    const currentImages = this.existingImages();
    const filtered = currentImages.filter(img => img !== imageUrl);
    this.existingImages.set(filtered);
    // Agregar a la lista de imágenes a eliminar
    this.imagesToDelete.set([...this.imagesToDelete(), imageUrl]);
  }

  removeExistingVideo() {
    const currentVideo = this.existingVideo();
    if (currentVideo) {
      this.imagesToDelete.set([...this.imagesToDelete(), currentVideo]);
    }
    this.existingVideo.set(null);
  }

  removeVideo() {
    if (this.showEditModal()) {
      const video = this.editPostVideo();
      if (video && this.videoPreviewCache.has(video)) {
        const url = this.videoPreviewCache.get(video)!;
        URL.revokeObjectURL(url);
        this.videoPreviewCache.delete(video);
        const urlIndex = this.previewUrls.indexOf(url);
        if (urlIndex > -1) {
          this.previewUrls.splice(urlIndex, 1);
        }
      }
      this.editPostVideo.set(null);
    } else {
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

  async likePost(post: Post, event?: Event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const user = this.firebaseService.getCurrentUser();
    if (!user || !post.id) return;
    try {
      await this.firebaseService.likePost(post.id, user.uid);
      // La actualización en tiempo real se maneja automáticamente por la suscripción onSnapshot
    } catch (error) {
      console.error('Error dando like al post:', error);
    }
  }

  async dislikePost(post: Post, event?: Event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const user = this.firebaseService.getCurrentUser();
    if (!user || !post.id) return;
    try {
      await this.firebaseService.dislikePost(post.id, user.uid);
      // La actualización en tiempo real se maneja automáticamente por la suscripción onSnapshot
    } catch (error) {
      console.error('Error dando dislike al post:', error);
    }
  }

  isDisliked(post: Post): boolean {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !post.dislikes) return false;
    return post.dislikes.includes(user.uid);
  }

  openPost(post: Post) {
    this.selectedPost.set(post);
    // Inicializar el índice del carrusel si no existe
    if (post.id && !this.postImageIndices().has(post.id)) {
      this.setCurrentImageIndex(post.id, 0);
    }
    this.showPostModal.set(true);
    
    // Suscribirse a actualizaciones en tiempo real del post
    if (post.id) {
      this.postSubscription?.unsubscribe(); // Limpiar suscripción anterior
      this.postSubscription = this.firebaseService.getPostById(post.id).subscribe({
        next: (updatedPost) => {
          if (updatedPost) {
            this.selectedPost.set(updatedPost);
            // Actualizar también en la lista de posts si existe
            const posts = this.posts();
            const postIndex = posts.findIndex(p => p.id === post.id);
            if (postIndex !== -1) {
              const updatedPosts = [...posts];
              updatedPosts[postIndex] = updatedPost;
              this.posts.set(updatedPosts);
            }
          }
        },
        error: (error) => {
          console.error('Error actualizando post en tiempo real:', error);
        }
      });
    }
  }

  closePostModal() {
    this.showPostModal.set(false);
    this.selectedPost.set(null);
    this.newComment.set('');
    this.replyingToComment.set(null);
    this.replyCommentText.set(new Map());
    this.postSubscription?.unsubscribe(); // Limpiar suscripción
  }

  closeCreateModal() {
    this.cleanupPreviewUrls();
    this.showCreateModal.set(false);
    this.newPostContent.set('');
    this.newPostImages.set([]);
    this.newPostVideo.set(null);
  }

  async addComment(commentIndex?: number) {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !this.selectedPost()?.id) return;

    const commentText = commentIndex !== undefined 
      ? this.replyCommentText().get(commentIndex)?.trim() 
      : this.newComment().trim();

    if (!commentText) return;

    // Guardar el texto del comentario antes de limpiar
    const savedCommentText = commentText;
    
    // Limpiar inputs primero para mejor UX
    if (commentIndex !== undefined) {
      const replyMap = new Map(this.replyCommentText());
      replyMap.delete(commentIndex);
      this.replyCommentText.set(replyMap);
      this.replyingToComment.set(null);
    } else {
      this.newComment.set('');
    }

    try {
      await this.firebaseService.addComment(this.selectedPost()!.id!, {
        authorId: user.uid,
        authorName: this.currentUser()!.displayName || user.displayName || 'Usuario',
        authorPhoto: this.currentUser()!.photoURL || user.photoURL || null,
        content: savedCommentText
      }, commentIndex);
    } catch (error: any) {
      console.error('Error agregando comentario:', error);
      // Solo mostrar error si no es un error de notificación (el comentario se agregó pero falló la notificación)
      if (error?.message && !error.message.includes('notification') && !error.message.includes('notificación')) {
        // Restaurar el texto del comentario si falló
        if (commentIndex !== undefined) {
          const replyMap = new Map(this.replyCommentText());
          replyMap.set(commentIndex, savedCommentText);
          this.replyCommentText.set(replyMap);
          this.replyingToComment.set(commentIndex);
        } else {
          this.newComment.set(savedCommentText);
        }
        alert('Error al agregar el comentario. Por favor intenta nuevamente.');
      }
      // Si el error es solo de notificación, no mostrar alerta ya que el comentario se agregó correctamente
    }
  }

  async likeComment(commentIndex: number, replyIndex?: number) {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !this.selectedPost()?.id) return;
    try {
      await this.firebaseService.likeComment(this.selectedPost()!.id!, commentIndex, user.uid, replyIndex);
    } catch (error) {
      console.error('Error dando like al comentario:', error);
    }
  }

  async dislikeComment(commentIndex: number, replyIndex?: number) {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !this.selectedPost()?.id) return;
    try {
      await this.firebaseService.dislikeComment(this.selectedPost()!.id!, commentIndex, user.uid, replyIndex);
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

  async deletePost(post: Post) {
    if (!post.id) return;
    
    if (!confirm('¿Estás seguro de que quieres eliminar esta publicación?')) return;
    
    try {
      await this.firebaseService.deletePost(post.id);
      this.loadPosts();
      if (this.selectedPost()?.id === post.id) {
        this.closePostModal();
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Error al eliminar la publicación');
    }
  }

  openEditModal(post: Post) {
    this.editingPost.set(post);
    this.editPostContent.set(post.content);
    this.editPostImages.set([]);
    this.editPostVideo.set(null);
    this.existingImages.set(post.images || []);
    this.existingVideo.set(post.video || null);
    this.imagesToDelete.set([]);
    this.showEditModal.set(true);
  }

  closeEditModal() {
    this.showEditModal.set(false);
    this.editingPost.set(null);
    this.editPostContent.set('');
    this.editPostImages.set([]);
    this.editPostVideo.set(null);
    this.existingImages.set([]);
    this.existingVideo.set(null);
    this.imagesToDelete.set([]);
    // Limpiar previews de imágenes/videos nuevos
    this.cleanupPreviewUrls();
  }

  async updatePost() {
    const post = this.editingPost();
    if (!post || !post.id) return;

    if (!this.editPostContent().trim()) {
      alert('Por favor ingresa contenido para la publicación');
      return;
    }

    this.uploading.set(true);
    try {
      const user = this.firebaseService.getCurrentUser();
      if (!user) return;

      const updateData: any = {
        content: this.editPostContent().trim()
      };

      // Manejar imágenes: mantener las existentes que no se eliminaron, agregar nuevas
      const remainingImages = this.existingImages().filter(img => !this.imagesToDelete().includes(img));
      
      // Si hay nuevas imágenes, subirlas
      if (this.editPostImages().length > 0) {
        const newImages: string[] = [];
        for (const file of this.editPostImages()) {
          const fileName = `${post.id}_${Date.now()}_${file.name}`;
          const url = await this.firebaseService.uploadImage(file, `posts/${user.uid}/${post.id}/${fileName}`);
          newImages.push(url);
        }
        // Combinar imágenes existentes (sin las eliminadas) con las nuevas
        updateData.images = [...remainingImages, ...newImages];
      } else if (this.imagesToDelete().length > 0 || remainingImages.length !== (post.images || []).length) {
        // Actualizar si se eliminaron imágenes o si hay cambios
        updateData.images = remainingImages;
      }

      // Manejar video
      if (this.editPostVideo()) {
        // Si hay nuevo video, subirlo (reemplaza el anterior)
        const fileName = `${post.id}_${Date.now()}_${this.editPostVideo()!.name}`;
        const video = await this.firebaseService.uploadVideo(this.editPostVideo()!, `posts/${user.uid}/${post.id}/${fileName}`);
        updateData.video = video;
      } else if (!this.existingVideo() && post.video) {
        // Si había video pero ahora no hay (se eliminó)
        updateData.video = null;
      } else if (this.existingVideo() && this.imagesToDelete().includes(this.existingVideo()!)) {
        // Si se marcó el video existente para eliminar
        updateData.video = null;
      }

      await this.firebaseService.updatePost(post.id, updateData);
      this.closeEditModal();
      this.loadPosts();
    } catch (error) {
      console.error('Error updating post:', error);
      alert('Error al actualizar la publicación');
    } finally {
      this.uploading.set(false);
    }
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

