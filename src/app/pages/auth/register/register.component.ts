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
  region = signal('la1');
  password = signal('');
  confirmPassword = signal('');
  loading = signal(false);
  error = signal('');
  errors = signal<{ [key: string]: string }>({});

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
    this.errors.set({});
    this.error.set('');

    // Validaciones
    const validationErrors: { [key: string]: string } = {};

    if (!this.gameName().trim()) {
      validationErrors['gameName'] = 'El nombre de invocador es requerido';
    } else if (this.gameName().trim().length < 3) {
      validationErrors['gameName'] = 'El nombre debe tener al menos 3 caracteres';
    } else if (this.gameName().trim().length > 16) {
      validationErrors['gameName'] = 'El nombre no puede tener más de 16 caracteres';
    }

    if (!this.tagLine().trim()) {
      validationErrors['tagLine'] = 'El tagline es requerido';
    } else if (this.tagLine().trim().length < 3) {
      validationErrors['tagLine'] = 'El tagline debe tener al menos 3 caracteres';
    } else if (this.tagLine().trim().length > 5) {
      validationErrors['tagLine'] = 'El tagline no puede tener más de 5 caracteres';
    }

    if (!this.password().trim()) {
      validationErrors['password'] = 'La contraseña es requerida';
    } else if (this.password().length < 8) {
      validationErrors['password'] = 'La contraseña debe tener al menos 8 caracteres';
    } else if (!this.isValidPassword(this.password())) {
      validationErrors['password'] = 'La contraseña debe incluir mayúsculas, minúsculas y números';
    }

    if (!this.confirmPassword().trim()) {
      validationErrors['confirmPassword'] = 'Confirma tu contraseña';
    } else if (this.password() !== this.confirmPassword()) {
      validationErrors['confirmPassword'] = 'Las contraseñas no coinciden';
    }

    if (Object.keys(validationErrors).length > 0) {
      this.errors.set(validationErrors);
      return;
    }

    this.loading.set(true);

    try {
      // Verificar que el invocador existe en Riot Games
      const response = await fetch(`/api/summoner/${this.region()}/${this.gameName()}/${this.tagLine()}`);
      
      if (!response.ok) {
        throw new Error('Invocador no encontrado. Verifica tu nombre de invocador, tagline y región.');
      }

      const summonerData = await response.json();

      // Registrar en Firebase usando Riot Games
      await this.firebaseService.registerWithRiot(
        this.gameName(),
        this.tagLine(),
        this.region(),
        summonerData.puuid,
        this.password()
      );

      this.router.navigate(['/']);
    } catch (err: any) {
      this.error.set(err.message || 'Error al registrarse. Verifica que tu cuenta de Riot Games sea válida.');
    } finally {
      this.loading.set(false);
    }
  }

  private isValidPassword(password: string): boolean {
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /[0-9]/.test(password);
    return hasUpperCase && hasLowerCase && hasNumbers;
  }
}

