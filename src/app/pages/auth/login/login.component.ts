import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
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
  private route = inject(ActivatedRoute);

  ngOnInit() {
    // Verificar si ya está logueado y redirigir
    const user = this.firebaseService.getCurrentUser();
    if (user) {
      this.redirectAfterLogin();
      return;
    }
    
    // También suscribirse al observable por si el estado cambia
    this.firebaseService.currentUser.subscribe(user => {
      if (user) {
        this.redirectAfterLogin();
      }
    });
  }

  private redirectAfterLogin() {
    // Obtener la URL de retorno de los query params
    const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/';
    this.router.navigate([returnUrl], { replaceUrl: true });
  }

  async onLogin() {
    if (!this.gameName().trim() || !this.tagLine().trim()) {
      this.error.set('Por favor ingresa tu nombre de invocador y tagline');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      // Intentar login usando Firebase directamente (sin verificación de API)
      // Buscar usuario por gameName y tagLine en Firestore
      await this.firebaseService.loginWithRiot(
        this.gameName().trim(),
        this.tagLine().trim(),
        this.region(),
        null, // puuid - será buscado en Firebase
        this.password(),
        this.rememberMe()
      );

      this.redirectAfterLogin();
    } catch (err: any) {
      this.loading.set(false);
      this.error.set(err.message || 'Error al iniciar sesión. Verifica tus credenciales.');
    }
  }
}

