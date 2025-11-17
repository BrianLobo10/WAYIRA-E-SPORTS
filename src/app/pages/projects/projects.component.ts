import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SectionHeaderComponent } from '../../components/section-header/section-header.component';
import { UniversalCardComponent } from '../../components/universal-card/universal-card.component';
import { CardsGridComponent } from '../../components/cards-grid/cards-grid.component';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, SectionHeaderComponent, UniversalCardComponent, CardsGridComponent],
  templateUrl: './projects.component.html',
  styleUrls: ['./projects.component.css']
})
export class ProjectsComponent {
  projects = [
    {
      icon: 'trophy',
      title: 'Liga Wayira 2024',
      description: 'Torneo nacional de League of Legends con premios en efectivo y reconocimiento profesional',
      status: 'En curso',
      date: '2024'
    },
    {
      icon: 'graduation',
      title: 'Academia de Jugadores',
      description: 'Programa de formación y desarrollo de talento para jugadores aspirantes a profesionales',
      status: 'Activo',
      date: '2024'
    },
    {
      icon: 'video',
      title: 'Transmisiones en Vivo',
      description: 'Lives y streams profesionales de torneos y eventos competitivos',
      status: 'Activo',
      date: '2024'
    },
    {
      icon: 'handshake',
      title: 'Alianzas Estratégicas',
      description: 'Colaboraciones con marcas y organizaciones para el crecimiento del ecosistema',
      status: 'Activo',
      date: '2024'
    }
  ];
}

