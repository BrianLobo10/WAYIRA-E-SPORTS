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
      title: 'Horas de Transmisión',
      value: '500+',
      description: 'Lives y streams de torneos'
    },
    {
      icon: 'globe',
      title: 'Alcance Nacional',
      value: 'Colombia',
      description: 'Presencia en todo el territorio'
    }
  ];

  services = [
    {
      icon: 'trophy',
      title: 'Organización de Torneos',
      description: 'Competencias desde nivel local hasta ligas nacionales con cobertura profesional y transmisiones en vivo'
    },
    {
      icon: 'graduation',
      title: 'Formación de Jugadores',
      description: 'Entrenamiento, coaching y desarrollo de habilidades para equipos y jugadores aspirantes a profesionales'
    },
    {
      icon: 'video',
      title: 'Transmisiones en Vivo',
      description: 'Lives y streams profesionales de torneos y eventos competitivos en tiempo real'
    },
    {
      icon: 'handshake',
      title: 'Alianzas Estratégicas',
      description: 'Conexión con marcas y patrocinadores para visibilidad y crecimiento del ecosistema'
    },
    {
      icon: 'users',
      title: 'Comunidad Gaming',
      description: 'Construcción y gestión de una comunidad activa y comprometida con los e-Sports'
    },
    {
      icon: 'globe',
      title: 'Expansión Nacional',
      description: 'Presencia y eventos en diferentes regiones de Colombia para promover el talento local'
    }
  ];
}

