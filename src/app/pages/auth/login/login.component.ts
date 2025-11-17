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
  email = signal('');
  password = signal('');
  loading = signal(false);
  error = signal('');

  private firebaseService = inject(FirebaseService);
  private router = inject(Router);

  async onLogin() {
    if (!this.email().trim() || !this.password().trim()) {
      this.error.set('Por favor ingresa tu email y contraseña');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      await this.firebaseService.login(this.email(), this.password());
      this.router.navigate(['/']);
    } catch (err: any) {
      this.error.set(err.message || 'Error al iniciar sesión');
    } finally {
      this.loading.set(false);
    }
  }
}

