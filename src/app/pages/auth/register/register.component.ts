import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FirebaseService } from '../../../services/firebase.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent {
  gameName = signal('');
  tagLine = signal('');
  email = signal('');
  password = signal('');
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

  async onRegister() {
    if (!this.gameName().trim() || !this.tagLine().trim() || !this.email().trim() || !this.password().trim()) {
      this.error.set('Por favor completa todos los campos');
      return;
    }

    if (!this.isValidEmail(this.email())) {
      this.error.set('Por favor ingresa un email válido');
      return;
    }

    if (this.password().length < 6) {
      this.error.set('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      // Verificar que el invocador existe
      const response = await fetch(`/api/summoner/${this.region()}/${this.gameName()}/${this.tagLine()}`);
      
      if (!response.ok) {
        throw new Error('Invocador no encontrado. Verifica tu nombre y región.');
      }

      const summonerData = await response.json();

      // Registrar en Firebase
      await this.firebaseService.registerWithRiot(
        this.email(),
        this.password(),
        this.gameName(),
        this.tagLine(),
        this.region(),
        summonerData.puuid
      );

      this.router.navigate(['/']);
    } catch (err: any) {
      this.error.set(err.message || 'Error al registrarse');
    } finally {
      this.loading.set(false);
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

