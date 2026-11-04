import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SectionHeaderComponent } from '../../components/section-header/section-header.component';
import { UniversalCardComponent } from '../../components/universal-card/universal-card.component';
import { CardsGridComponent } from '../../components/cards-grid/cards-grid.component';
import { RevealDirective } from '../../directives/reveal.directive';
import { AdminService, type ProjectRow } from '../../services/admin.service';
import { AuthService } from '../../services/auth.service';

/**
 * Proyectos públicos (tabla `projects`): la base solo entrega los activos a los visitantes.
 * La gestión (crear, ordenar, imágenes, activar) vive en /staff/proyectos.
 */
@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [RevealDirective, CommonModule, RouterLink, SectionHeaderComponent, UniversalCardComponent, CardsGridComponent],
  templateUrl: './projects.component.html',
  styleUrls: ['./projects.component.css']
})
export class ProjectsComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);

  readonly projects = signal<ProjectRow[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly canManage = computed(() => this.auth.hasPermission('site.content'));

  async ngOnInit() {
    try {
      // Quien gestiona recibe también los inactivos; aquí solo se muestran los visibles
      this.projects.set((await this.admin.listProjects()).filter((p) => p.active));
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  isLive(status: string): boolean {
    return status === 'Activo' || status === 'En curso';
  }
}
