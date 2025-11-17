import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FirebaseService } from '../../../services/firebase.service';
import { RiotApiService } from '../../../services/riot-api.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent implements OnInit {
  gameName = signal('');
  tagLine = signal('');
  region = signal('la1');
  email = signal('');
  password = signal('');
  confirmPassword = signal('');
  showPassword = signal(false);
  showConfirmPassword = signal(false);
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

  async onRegister() {
    this.errors.set({});
    this.error.set('');

    // Validaciones
    const validationErrors: { [key: string]: string } = {};

    if (!this.email().trim()) {
      validationErrors['email'] = 'El email es requerido';
    } else if (!this.isValidEmail(this.email())) {
      validationErrors['email'] = 'El email no es válido';
    }

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
      // Verificar que el invocador existe en Riot Games usando el mismo servicio que la búsqueda
      this.riotApiService.getSummoner(
        this.region(),
        this.gameName().trim(),
        this.tagLine().trim()
      ).subscribe({
        next: async (summonerData) => {
          try {
            // Registrar en Firebase usando Riot Games
            await this.firebaseService.registerWithRiot(
              this.gameName().trim(),
              this.tagLine().trim(),
              this.region(),
              summonerData.puuid,
              this.password(),
              this.email().trim() // Email es obligatorio
            );

            this.router.navigate(['/']);
          } catch (err: any) {
            console.error('Error en registro:', err);
            let errorMessage = err.message || err.error?.message || 'Error al registrarse. Por favor intenta nuevamente.';
            
            // Si es un usuario huérfano, ofrecer intentar recrear el perfil
            if (errorMessage.includes('no tiene perfil')) {
              // Intentar recrear el perfil si el usuario puede iniciar sesión
              try {
                const orphanedUser = await this.firebaseService.recreateProfileIfOrphaned(
                  this.email().trim(),
                  this.password()
                );
                
                if (orphanedUser) {
                  // Recrear el perfil con los datos del registro
                  await this.firebaseService.recreateUserProfile(
                    orphanedUser.uid,
                    this.gameName().trim(),
                    this.tagLine().trim(),
                    this.region(),
                    summonerData.puuid,
                    this.email().trim()
                  );
                  
                  // Perfil recreado exitosamente
                  this.error.set('');
                  this.router.navigate(['/']);
                  return;
                }
              } catch (recreateError: any) {
                // Si no puede recrear, mostrar el mensaje original
                console.error('Error recreando perfil:', recreateError);
              }
            }
            
            this.error.set(errorMessage);
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
      this.error.set(err.message || 'Error al registrarse. Verifica que tu cuenta de Riot Games sea válida.');
    }
  }

  private isValidPassword(password: string): boolean {
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /[0-9]/.test(password);
    return hasUpperCase && hasLowerCase && hasNumbers;
  }

  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

