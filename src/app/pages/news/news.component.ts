import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SectionHeaderComponent } from '../../components/section-header/section-header.component';

@Component({
  selector: 'app-news',
  standalone: true,
  imports: [CommonModule, SectionHeaderComponent],
  templateUrl: './news.component.html',
  styleUrls: ['./news.component.css']
})
export class NewsComponent {
  news = [
    {
      title: 'Inicio de la Liga Wayira 2024',
      date: '15 de Enero, 2024',
      category: 'Torneos',
      excerpt: 'Comienza la temporada 2024 de nuestra liga nacional con equipos de toda Colombia compitiendo por el título.',
      image: 'https://via.placeholder.com/400x250?text=Noticia+1'
    },
    {
      title: 'Nueva Academia de Jugadores',
      date: '10 de Enero, 2024',
      category: 'Formación',
      excerpt: 'Abrimos las inscripciones para nuestro programa de formación profesional para jugadores aspirantes.',
      image: 'https://via.placeholder.com/400x250?text=Noticia+2'
    },
    {
      title: 'Alianza Estratégica con Riot Games',
      date: '5 de Enero, 2024',
      category: 'Alianzas',
      excerpt: 'Anunciamos nuestra colaboración oficial con Riot Games para promover los e-Sports en Colombia.',
      image: 'https://via.placeholder.com/400x250?text=Noticia+3'
    }
  ];
}

