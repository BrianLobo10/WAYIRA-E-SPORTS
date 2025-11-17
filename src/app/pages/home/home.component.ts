import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UniversalCardComponent } from '../../components/universal-card/universal-card.component';
import { CardsGridComponent } from '../../components/cards-grid/cards-grid.component';
import { SectionHeaderComponent } from '../../components/section-header/section-header.component';
import { TwitchEmbedComponent } from '../../components/twitch-embed/twitch-embed.component';
import { CommunitySectionComponent } from '../../components/community-section/community-section.component';

@Component({
  selector: 'app-home',
  imports: [RouterLink, UniversalCardComponent, CardsGridComponent, SectionHeaderComponent, TwitchEmbedComponent, CommunitySectionComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  valores = [
    {
      icon: 'star',
      title: 'Excelencia',
      description: 'Altos estándares en cada competición y evento'
    },
    {
      icon: 'shield',
      title: 'Integridad',
      description: 'Honestidad, transparencia y responsabilidad'
    },
    {
      icon: 'users',
      title: 'Trabajo en equipo',
      description: 'Éxito construido en colaboración'
    },
    {
      icon: 'globe',
      title: 'Inclusión',
      description: 'E-sports para todo el mundo sin discriminación'
    }
  ];

  servicios = [
    {
      icon: 'trophy',
      title: 'Torneos y Eventos',
      description: 'Competencias desde nivel local hasta ligas nacionales con cobertura profesional'
    },
    {
      icon: 'graduation',
      title: 'Formación de Jugadores',
      description: 'Entrenamiento, coaching y desarrollo de habilidades para equipos y jugadores'
    },
    {
      icon: 'video',
      title: 'Producción de Contenido',
      description: 'Transmisiones, análisis, entrevistas y cobertura multimedia profesional'
    },
    {
      icon: 'handshake',
      title: 'Alianzas Estratégicas',
      description: 'Conexión con marcas y patrocinadores para visibilidad y crecimiento'
    }
  ];
}

