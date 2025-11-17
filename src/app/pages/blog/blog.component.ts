import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FirebaseService, Post, Comment, UserProfile } from '../../services/firebase.service';

@Component({
  selector: 'app-blog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './blog.component.html',
  styleUrls: ['./blog.component.css']
})
export class BlogComponent implements OnInit {
  private firebaseService = inject(FirebaseService);
  
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
    this.loadCurrentUser();
  }

  async loadPosts() {
    this.loading.set(true);
    this.firebaseService.getPosts(50).subscribe({
      next: (posts) => {
        this.posts.set(posts);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  async loadCurrentUser() {
    const user = this.firebaseService.getCurrentUser();
    if (user) {
      const profile = await this.firebaseService.getUserProfile(user.uid);
      this.currentUser.set(profile);
    }
  }

  async createPost() {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !this.currentUser()) return;

    this.uploading.set(true);
    try {
      const images: string[] = [];
      let video: string | undefined;

      // Upload images
      for (const file of this.newPostImages()) {
        const url = await this.firebaseService.uploadImage(file, `posts/${user.uid}/${Date.now()}_${file.name}`);
        images.push(url);
      }

      // Upload video
      if (this.newPostVideo()) {
        video = await this.firebaseService.uploadVideo(this.newPostVideo()!, `posts/${user.uid}/${Date.now()}_${this.newPostVideo()!.name}`);
      }

      await this.firebaseService.createPost({
        authorId: user.uid,
        authorName: this.currentUser()!.displayName,
        authorPhoto: this.currentUser()!.photoURL,
        content: this.newPostContent(),
        images: images.length > 0 ? images : undefined,
        video: video
      });

      this.newPostContent.set('');
      this.newPostImages.set([]);
      this.newPostVideo.set(null);
      this.showCreateModal.set(false);
      this.loadPosts();
    } catch (error) {
      console.error('Error creating post:', error);
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

  async likePost(post: Post) {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !post.id) return;
    await this.firebaseService.likePost(post.id, user.uid);
    this.loadPosts();
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

