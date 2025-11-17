import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FirebaseService } from '../../../services/firebase.service';
import { RiotApiService } from '../../../services/riot-api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  gameName = signal('');
  tagLine = signal('');
  region = signal('la2');
  password = signal('');
  showPassword = signal(false);
  rememberMe = signal(false);
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
  private riotApiService = inject(RiotApiService);
  private router = inject(Router);

  ngOnInit() {
    // Verificar si ya está logueado y redirigir
    const user = this.firebaseService.getCurrentUser();
    if (user) {
      this.router.navigate(['/']);
      return;
    }
    
    // También suscribirse al observable por si el estado cambia
    this.firebaseService.currentUser.subscribe(user => {
      if (user) {
        this.router.navigate(['/']);
      }
    });
  }

  async onLogin() {
    if (!this.gameName().trim() || !this.tagLine().trim()) {
      this.error.set('Por favor ingresa tu nombre de invocador y tagline');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      // Verificar que el invocador existe en Riot Games usando el mismo servicio que la búsqueda
      this.riotApiService.getSummoner(
        this.region(),
        this.gameName().trim(),
        this.tagLine().trim()
      ).subscribe({
        next: async (summonerData) => {
          try {
            // Iniciar sesión usando Riot Games
            await this.firebaseService.loginWithRiot(
              this.gameName().trim(),
              this.tagLine().trim(),
              this.region(),
              summonerData.puuid,
              this.password(),
              this.rememberMe()
            );

            this.router.navigate(['/']);
          } catch (err: any) {
            this.error.set(err.message || 'Error al iniciar sesión. Verifica tu contraseña.');
            this.loading.set(false);
          }
        },
        error: (err) => {
          this.loading.set(false);
          if (err.status === 404) {
            this.error.set('Invocador no encontrado. Verifica tu nombre de invocador, tagline y región.');
          } else if (err.error?.error) {
            this.error.set(err.error.error);
          } else {
            this.error.set('Error al verificar el invocador. Verifica que tu cuenta de Riot Games sea válida.');
          }
        }
      });
    } catch (err: any) {
      this.loading.set(false);
      this.error.set(err.message || 'Error al iniciar sesión. Verifica que tu cuenta de Riot Games sea válida.');
    }
  }
}

