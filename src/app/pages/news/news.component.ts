import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SectionHeaderComponent } from '../../components/section-header/section-header.component';
import { FirebaseService, News, UserProfile } from '../../services/firebase.service';
import { User } from '@angular/fire/auth';

@Component({
  selector: 'app-news',
  standalone: true,
  imports: [CommonModule, FormsModule, SectionHeaderComponent],
  templateUrl: './news.component.html',
  styleUrls: ['./news.component.css']
})
export class NewsComponent implements OnInit {
  private firebaseService = inject(FirebaseService);
  
  news = signal<News[]>([]);
  loading = signal(true);
  currentUser = signal<UserProfile | null>(null);
  isAdmin = signal(false);
  
  // Admin modal
  showCreateModal = signal(false);
  showEditModal = signal(false);
  selectedNews = signal<News | null>(null);
  
  // Form fields
  newsTitle = signal('');
  newsContent = signal('');
  newsExcerpt = signal('');
  newsCategory = signal('Torneos');
  newsImageUrl = signal('');
  newsImageFile = signal<File | null>(null);
  newsPublished = signal(false);
  uploading = signal(false);

  categories = ['Torneos', 'Formación', 'Alianzas', 'Comunidad', 'Eventos', 'General'];

  async ngOnInit() {
    await this.checkAdminStatus();
    this.loadNews();
  }

  async checkAdminStatus() {
    const user = this.firebaseService.getCurrentUser();
    if (user) {
      const profile = await this.firebaseService.getUserProfile(user.uid);
      this.currentUser.set(profile);
      if (profile) {
        const admin = await this.firebaseService.isAdmin(user.uid);
        this.isAdmin.set(admin);
      }
    }
  }

  loadNews() {
    this.loading.set(true);
    // Si es admin, cargar todas las noticias (publicadas y no publicadas)
    if (this.isAdmin()) {
      this.firebaseService.getAllNews(50).subscribe({
        next: (newsList) => {
          this.news.set(newsList);
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      });
    } else {
      // Si no es admin, solo cargar noticias publicadas
      this.firebaseService.getNews(50).subscribe({
        next: (newsList) => {
          this.news.set(newsList);
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      });
    }
  }

  openCreateModal() {
    this.resetForm();
    this.showCreateModal.set(true);
  }

  openEditModal(news: News) {
    this.selectedNews.set(news);
    this.newsTitle.set(news.title);
    this.newsContent.set(news.content);
    this.newsExcerpt.set(news.excerpt);
    this.newsCategory.set(news.category);
    this.newsImageUrl.set(news.imageUrl || '');
    this.newsPublished.set(news.published);
    this.showEditModal.set(true);
  }

  closeModal() {
    this.showCreateModal.set(false);
    this.showEditModal.set(false);
    this.selectedNews.set(null);
    this.resetForm();
  }

  resetForm() {
    this.newsTitle.set('');
    this.newsContent.set('');
    this.newsExcerpt.set('');
    this.newsCategory.set('Torneos');
    this.newsImageUrl.set('');
    this.newsImageFile.set(null);
    this.newsPublished.set(false);
  }

  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.type.startsWith('image/')) {
        this.newsImageFile.set(file);
        // Crear preview
        const reader = new FileReader();
        reader.onload = (e) => {
          this.newsImageUrl.set(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        alert('Por favor selecciona un archivo de imagen válido');
      }
    }
  }

  async createNews() {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !this.currentUser()) return;

    if (!this.newsTitle().trim() || !this.newsContent().trim() || !this.newsExcerpt().trim()) {
      alert('Por favor completa todos los campos requeridos');
      return;
    }

    this.uploading.set(true);
    try {
      let imageUrl = this.newsImageUrl() || null;
      
      // Si hay un archivo seleccionado, subirlo al storage
      if (this.newsImageFile()) {
        const file = this.newsImageFile()!;
        const fileName = `news/${Date.now()}_${file.name}`;
        imageUrl = await this.firebaseService.uploadImage(file, fileName);
      }
      
      await this.firebaseService.createNews({
        title: this.newsTitle(),
        content: this.newsContent(),
        excerpt: this.newsExcerpt(),
        category: this.newsCategory(),
        imageUrl: imageUrl,
        authorId: user.uid,
        authorName: this.currentUser()!.displayName || 'Admin',
        published: this.newsPublished()
      });
      
      this.closeModal();
      this.loadNews();
    } catch (error) {
      console.error('Error creating news:', error);
      alert('Error al crear la noticia');
    } finally {
      this.uploading.set(false);
    }
  }

  async updateNews() {
    const news = this.selectedNews();
    if (!news || !news.id) return;

    if (!this.newsTitle().trim() || !this.newsContent().trim() || !this.newsExcerpt().trim()) {
      alert('Por favor completa todos los campos requeridos');
      return;
    }

    this.uploading.set(true);
    try {
      await this.firebaseService.updateNews(news.id, {
        title: this.newsTitle(),
        content: this.newsContent(),
        excerpt: this.newsExcerpt(),
        category: this.newsCategory(),
        imageUrl: this.newsImageUrl() || null,
        published: this.newsPublished()
      });
      
      this.closeModal();
      this.loadNews();
    } catch (error) {
      console.error('Error updating news:', error);
      alert('Error al actualizar la noticia');
    } finally {
      this.uploading.set(false);
    }
  }

  async deleteNews(newsId: string) {
    if (!confirm('¿Estás seguro de que quieres eliminar esta noticia?')) return;

    try {
      await this.firebaseService.deleteNews(newsId);
      this.loadNews();
    } catch (error) {
      console.error('Error deleting news:', error);
      alert('Error al eliminar la noticia');
    }
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
}

