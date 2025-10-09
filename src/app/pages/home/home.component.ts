import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  valores = [
    {
      icon: '⚡',
      title: 'Excelencia',
      description: 'Altos estándares en cada competición y evento'
    },
    {
      icon: '🤝',
      title: 'Integridad',
      description: 'Honestidad, transparencia y responsabilidad'
    },
    {
      icon: '👥',
      title: 'Trabajo en equipo',
      description: 'Éxito construido en colaboración'
    },
    {
      icon: '🌈',
      title: 'Inclusión',
      description: 'E-sports para todo el mundo sin discriminación'
    }
  ];

  servicios = [
    {
      icon: '🏆',
      title: 'Torneos y Eventos',
      description: 'Competencias desde nivel local hasta ligas nacionales con cobertura profesional'
    },
    {
      icon: '🎓',
      title: 'Formación de Jugadores',
      description: 'Entrenamiento, coaching y desarrollo de habilidades para equipos y jugadores'
    },
    {
      icon: '🎬',
      title: 'Producción de Contenido',
      description: 'Transmisiones, análisis, entrevistas y cobertura multimedia profesional'
    },
    {
      icon: '🤝',
      title: 'Alianzas Estratégicas',
      description: 'Conexión con marcas y patrocinadores para visibilidad y crecimiento'
    },
    {
      icon: '💻',
      title: 'Desarrollo Tecnológico',
      description: 'Plataformas para gestión de torneos, rankings y comunidad'
    }
  ];
}

