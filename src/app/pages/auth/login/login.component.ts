import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FirebaseService } from '../../../services/firebase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  gameName = signal('');
  tagLine = signal('');
  region = signal('la1');
  loading = signal(false);
  error = signal('');

  regions = [
    { code: 'la1', name: 'LAS - Latinoamérica Sur' },
    { code: 'la2', name: 'LAN - Latinoamérica Norte' },
    { code: 'na1', name: 'NA - Norteamérica' },
    { code: 'br1', name: 'BR - Brasil' },
    { code: 'euw1', name: 'EUW - Europa Oeste' },
    { code: 'eun1', name: 'EUN - Europa Nórdica' },
    { code: 'kr', name: 'KR - Corea' },
    { code: 'jp1', name: 'JP - Japón' }
  ];

  private firebaseService = inject(FirebaseService);
  private router = inject(Router);

  async onLogin() {
    if (!this.gameName().trim() || !this.tagLine().trim()) {
      this.error.set('Por favor ingresa tu nombre de invocador y tagline');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      // Verificar que el invocador existe en Riot Games
      const response = await fetch(`/api/summoner/${this.region()}/${this.gameName()}/${this.tagLine()}`);
      
      if (!response.ok) {
        throw new Error('Invocador no encontrado. Verifica tu nombre de invocador, tagline y región.');
      }

      const summonerData = await response.json();

      // Iniciar sesión usando Riot Games
      await this.firebaseService.loginWithRiot(
        this.gameName(),
        this.tagLine(),
        this.region(),
        summonerData.puuid
      );

      this.router.navigate(['/']);
    } catch (err: any) {
      this.error.set(err.message || 'Error al iniciar sesión. Verifica que tu cuenta de Riot Games sea válida.');
    } finally {
      this.loading.set(false);
    }
  }
}

