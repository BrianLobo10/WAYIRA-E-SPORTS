import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SectionHeaderComponent } from '../../components/section-header/section-header.component';
import { UniversalCardComponent } from '../../components/universal-card/universal-card.component';
import { CardsGridComponent } from '../../components/cards-grid/cards-grid.component';
import type { ActiveProject } from '../../models';
import { ContentService } from '../../services/content.service';
import { RevealDirective } from '../../directives/reveal.directive';

const DEFAULT_PROJECTS: ActiveProject[] = [
  { icon: 'trophy', title: 'Liga Wayira 2024', description: 'Torneo nacional de League of Legends con premios en efectivo y reconocimiento profesional', status: 'En curso', date: '2024' },
  { icon: 'graduation', title: 'Academia de Jugadores', description: 'Programa de formación y desarrollo de talento para jugadores aspirantes a profesionales', status: 'Activo', date: '2024' },
  { icon: 'video', title: 'Transmisiones en Vivo', description: 'Lives y streams profesionales de torneos y eventos competitivos', status: 'Activo', date: '2024' },
  { icon: 'handshake', title: 'Alianzas Estratégicas', description: 'Colaboraciones con marcas y organizaciones para el crecimiento del ecosistema', status: 'Activo', date: '2024' }
];

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [RevealDirective, CommonModule, FormsModule, SectionHeaderComponent, UniversalCardComponent, CardsGridComponent],
  templateUrl: './projects.component.html',
  styleUrls: ['./projects.component.css']
})
export class ProjectsComponent implements OnInit, OnDestroy {
  private content = inject(ContentService);

  projects = signal<ActiveProject[]>([]);
  isAdmin = signal(false);
  showEditModal = signal(false);
  /** Copia para editar en el modal */
  editList = signal<ActiveProject[]>([]);
  saving = signal(false);

  ngOnInit() {
    this.checkAdminStatus();
    void this.loadProjects();
  }

  ngOnDestroy() {}

  async loadProjects() {
    try {
      const items = await this.content.getProjects<ActiveProject>();
      this.projects.set(items.length > 0 ? items : DEFAULT_PROJECTS);
    } catch {
      this.projects.set(DEFAULT_PROJECTS);
    }
  }

  /** Puede editar quien tenga permiso de contenido del sitio (Editor o Administrador). */
  async checkAdminStatus() {
    try {
      this.isAdmin.set(await this.content.canEditSiteContent());
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
      await this.content.saveProjects(list);
      this.projects.set(list);
      this.closeEditModal();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'No se pudo guardar.');
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
