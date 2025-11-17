import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SectionHeaderComponent } from '../../components/section-header/section-header.component';
import { UniversalCardComponent } from '../../components/universal-card/universal-card.component';
import { CardsGridComponent } from '../../components/cards-grid/cards-grid.component';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, SectionHeaderComponent, UniversalCardComponent, CardsGridComponent],
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.css']
})
export class AboutComponent {
  team = [
    {
      name: 'Equipo de Desarrollo',
      role: 'Tecnología',
      description: 'Profesionales dedicados a crear la mejor experiencia digital'
    },
    {
      name: 'Equipo de Eventos',
      role: 'Organización',
      description: 'Especialistas en la planificación y ejecución de torneos'
    },
    {
      name: 'Equipo de Contenido',
      role: 'Producción',
      description: 'Creadores de contenido multimedia y transmisiones'
    }
  ];

  achievements = [
    {
      icon: 'trophy',
      title: 'Torneos Organizados',
      value: '50+',
      description: 'Eventos competitivos realizados'
    },
    {
      icon: 'users',
      title: 'Jugadores Activos',
      value: '1000+',
      description: 'Miembros de nuestra comunidad'
    },
    {
      icon: 'video',
      title: 'Horas de Contenido',
      value: '500+',
      description: 'Transmisiones y videos producidos'
    },
    {
      icon: 'globe',
      title: 'Alcance Nacional',
      value: 'Colombia',
      description: 'Presencia en todo el territorio'
    }
  ];
}

