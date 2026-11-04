import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SectionHeaderComponent } from '../../components/section-header/section-header.component';
import type { News, UserProfile } from '../../models';
import { ContentService } from '../../services/content.service';
import { RevealDirective } from '../../directives/reveal.directive';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';

@Component({
  selector: 'app-news',
  standalone: true,
  imports: [RevealDirective, CommonModule, FormsModule, SectionHeaderComponent],
  templateUrl: './news.component.html',
  styleUrls: ['./news.component.css']
})
export class NewsComponent implements OnInit {
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private content = inject(ContentService);
  
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

  ngOnInit() {
    // Verificar si es admin primero (puede ser async pero no bloquea)
    this.checkAdminStatus();
    // Cargar noticias (se ejecuta en el contexto correcto de Angular)
    this.loadNews();
  }

  async checkAdminStatus() {
    try {
      // Puede publicar quien tenga el permiso de noticias (Editor, Administrador…)
      const admin = await this.content.canManageNews();
      this.isAdmin.set(admin);
      if (admin) this.loadAllNews();
    } catch (error) {
      console.error('Error checking admin status:', error);
      // Si hay error, simplemente no es admin
      this.isAdmin.set(false);
    }
  }

  loadNews() {
    this.loading.set(true);
    // Siempre cargar noticias publicadas primero (funciona sin autenticación)
    // Si después se determina que es admin, se puede recargar con todas las noticias
    this.content.getNews(50).subscribe({
      next: (newsList) => {
        this.news.set(newsList);
        this.loading.set(false);
        // Si es admin, recargar con todas las noticias
        if (this.isAdmin()) {
          this.loadAllNews();
        }
      },
      error: (error: any) => {
        console.error('Error loading news:', error);
        // Si hay error de permisos o índice, intentar cargar sin filtro si es admin
        if (error.code === 'permission-denied' || error.message?.includes('index')) {
          console.warn('Error de permisos o índice, intentando cargar todas las noticias...');
        }
        this.loading.set(false);
      }
    });
  }

  private loadAllNews() {
    this.content.getNews(50).subscribe({
      next: (newsList) => {
        this.news.set(newsList);
      },
      error: (error) => {
        console.error('Error loading all news:', error);
        // Si falla, mantener las noticias publicadas que ya se cargaron
      }
    });
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
        this.toast.notify('Por favor selecciona un archivo de imagen válido');
      }
    }
  }

  async createNews() {
    if (!this.isAdmin()) return;

    if (!this.newsTitle().trim() || !this.newsContent().trim() || !this.newsExcerpt().trim()) {
      this.toast.notify('Por favor completa todos los campos requeridos');
      return;
    }

    this.uploading.set(true);
    try {
      let imageUrl = this.newsImageUrl() || null;
      
      // Si hay un archivo seleccionado, subirlo al storage
      if (this.newsImageFile()) {
        imageUrl = await this.content.uploadNewsImage(this.newsImageFile()!);
      }
      
      await this.content.createNews({
        title: this.newsTitle(),
        content: this.newsContent(),
        excerpt: this.newsExcerpt(),
        category: this.newsCategory(),
        imageUrl: imageUrl,
        published: this.newsPublished()
      });
      
      this.closeModal();
      this.loadNews();
    } catch (error) {
      console.error('Error creating news:', error);
      this.toast.notify(error instanceof Error ? error.message : 'Error al crear la noticia');
    } finally {
      this.uploading.set(false);
    }
  }

  async updateNews() {
    const news = this.selectedNews();
    if (!news || !news.id) return;

    if (!this.isAdmin()) {
      this.toast.notify('Solo los administradores pueden editar noticias');
      return;
    }

    if (!this.newsTitle().trim() || !this.newsContent().trim() || !this.newsExcerpt().trim()) {
      this.toast.notify('Por favor completa todos los campos requeridos');
      return;
    }

    this.uploading.set(true);
    try {
      // Si se eligió una imagen nueva, se sube primero
      if (this.newsImageFile()) {
        this.newsImageUrl.set(await this.content.uploadNewsImage(this.newsImageFile()!));
      }
      await this.content.updateNews(news.id, {
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
      this.toast.notify(error instanceof Error ? error.message : 'Error al actualizar la noticia');
    } finally {
      this.uploading.set(false);
    }
  }

  async deleteNews(newsId: string) {
    if (!this.isAdmin()) {
      this.toast.notify('Solo los administradores pueden eliminar noticias');
      return;
    }

    if (!(await this.dialog.confirm({ kicker: 'Acción permanente', title: '¿Eliminar esta noticia?', message: 'Si solo quieres ocultarla, guárdala como borrador.', confirmLabel: 'Eliminar noticia', danger: true }))) return;

    try {
      await this.content.deleteNews(newsId);
      this.loadNews();
    } catch (error) {
      console.error('Error deleting news:', error);
      this.toast.notify('Error al eliminar la noticia');
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

