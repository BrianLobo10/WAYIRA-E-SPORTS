import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SectionHeaderComponent } from '../../components/section-header/section-header.component';
import { UniversalCardComponent } from '../../components/universal-card/universal-card.component';
import { CardsGridComponent } from '../../components/cards-grid/cards-grid.component';
import { FirebaseService, ActiveProject } from '../../services/firebase.service';
import { Subscription } from 'rxjs';

const DEFAULT_PROJECTS: ActiveProject[] = [
  { icon: 'trophy', title: 'Liga Wayira 2024', description: 'Torneo nacional de League of Legends con premios en efectivo y reconocimiento profesional', status: 'En curso', date: '2024' },
  { icon: 'graduation', title: 'Academia de Jugadores', description: 'Programa de formación y desarrollo de talento para jugadores aspirantes a profesionales', status: 'Activo', date: '2024' },
  { icon: 'video', title: 'Transmisiones en Vivo', description: 'Lives y streams profesionales de torneos y eventos competitivos', status: 'Activo', date: '2024' },
  { icon: 'handshake', title: 'Alianzas Estratégicas', description: 'Colaboraciones con marcas y organizaciones para el crecimiento del ecosistema', status: 'Activo', date: '2024' }
];

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, FormsModule, SectionHeaderComponent, UniversalCardComponent, CardsGridComponent],
  templateUrl: './projects.component.html',
  styleUrls: ['./projects.component.css']
})
export class ProjectsComponent implements OnInit, OnDestroy {
  private firebaseService = inject(FirebaseService);
  private sub?: Subscription;

  projects = signal<ActiveProject[]>([]);
  isAdmin = signal(false);
  showEditModal = signal(false);
  /** Copia para editar en el modal */
  editList = signal<ActiveProject[]>([]);
  saving = signal(false);

  ngOnInit() {
    this.checkAdminStatus();
    this.sub = this.firebaseService.getProjectsRealtime().subscribe((items) => {
      this.projects.set(items.length > 0 ? items : DEFAULT_PROJECTS);
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  async checkAdminStatus() {
    try {
      const user = this.firebaseService.getCurrentUser();
      if (user) {
        const admin = await this.firebaseService.isAdmin(user.uid);
        this.isAdmin.set(admin);
      }
    } catch {
      this.isAdmin.set(false);
    }
  }

  openEditModal() {
    if (!this.isAdmin()) return;
    this.editList.set([...this.projects().map(p => ({ ...p }))]);
    if (this.editList().length === 0) {
      this.editList.set(DEFAULT_PROJECTS.map(p => ({ ...p })));
    }
    this.showEditModal.set(true);
  }

  closeEditModal() {
    this.showEditModal.set(false);
  }

  addProjectRow() {
    this.editList.update(list => [...list, { icon: 'folder', title: '', description: '', status: 'Activo', date: new Date().getFullYear().toString() }]);
  }

  removeProjectRow(i: number) {
    this.editList.update(list => list.filter((_, idx) => idx !== i));
  }

  updateEditProject(i: number, field: keyof ActiveProject, value: string) {
    this.editList.update(list => {
      const next = [...list];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  }

  async saveProjects() {
    if (!this.isAdmin()) return;
    const list = this.editList().filter(p => p.title?.trim());
    if (list.length === 0) {
      alert('Añade al menos un proyecto con título.');
      return;
    }
    this.saving.set(true);
    try {
      await this.firebaseService.setProjects(list);
      this.closeEditModal();
    } catch (e) {
      console.error(e);
      alert('Error al guardar. Revisa la consola y las reglas de Firestore.');
    } finally {
      this.saving.set(false);
    }
  }

  restoreDefaults() {
    if (!this.isAdmin()) return;
    if (!confirm('¿Restaurar la lista por defecto? Se perderán los cambios no guardados.')) return;
    this.editList.set(DEFAULT_PROJECTS.map(p => ({ ...p })));
  }
}
