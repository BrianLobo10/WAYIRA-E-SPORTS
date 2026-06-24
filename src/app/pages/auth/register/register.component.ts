import { Component, signal, inject, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FirebaseService } from '../../../services/firebase.service';
import { Auth } from '@angular/fire/auth';
import { RecaptchaVerifier } from 'firebase/auth';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent implements OnInit, AfterViewInit, OnDestroy {
  phone = signal('');
  verificationCode = signal('');
  codeSent = signal(false);
  loadingSocial = signal(false);
  loadingPhone = signal(false);
  loadingVerify = signal(false);
  error = signal('');

  private firebaseService = inject(FirebaseService);
  private router = inject(Router);
  private auth = inject(Auth);
  private recaptchaVerifier: RecaptchaVerifier | null = null;
  private confirmationResult: any = null;

  ngOnInit() {
    const user = this.firebaseService.getCurrentUser();
    if (user) {
      this.router.navigate(['/feed']);
      return;
    }
    this.firebaseService.currentUser.subscribe(user => {
      if (user) this.router.navigate(['/feed']);
    });
  }

  ngAfterViewInit() {
    this.initRecaptcha();
  }

  ngOnDestroy() {
    if (this.recaptchaVerifier) {
      try {
        this.recaptchaVerifier.clear();
      } catch (_) {}
    }
  }

  private initRecaptcha() {
    if (this.recaptchaVerifier) return;
    try {
      this.recaptchaVerifier = new RecaptchaVerifier(this.auth, 'recaptcha-phone-container-register', {
        size: 'invisible',
        callback: () => {}
      });
    } catch (e) {
      console.warn('RecaptchaVerifier init:', e);
    }
  }

  async onRegisterWithGoogle() {
    this.error.set('');
    this.loadingSocial.set(true);
    try {
      await this.firebaseService.setSessionPersistence(true);
      await this.firebaseService.loginWithGoogle();
      this.router.navigate(['/feed']);
    } catch (err: any) {
      this.loadingSocial.set(false);
      if (err?.code === 'auth/popup-closed-by-user') return;
      this.error.set(err?.message || 'No se pudo continuar con Google.');
    }
  }

  async onSendCode() {
    this.error.set('');
    let phoneNumber = this.phone().trim().replace(/\s/g, '');
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = '+51' + phoneNumber.replace(/^0/, '');
    }
    if (!phoneNumber || phoneNumber.length < 10) {
      this.error.set('Ingresa un número válido con código de país (ej. +51999123456).');
      return;
    }
    this.initRecaptcha();
    if (!this.recaptchaVerifier) {
      this.error.set('No se pudo cargar la verificación. Recarga la página.');
      return;
    }
    this.loadingPhone.set(true);
    try {
      this.confirmationResult = await this.firebaseService.sendPhoneVerificationCode(phoneNumber, this.recaptchaVerifier);
      this.codeSent.set(true);
      this.verificationCode.set('');
    } catch (err: any) {
      this.error.set(err?.message || 'No se pudo enviar el SMS. Revisa el número e intenta de nuevo.');
    } finally {
      this.loadingPhone.set(false);
    }
  }

  async onVerifyCode() {
    const code = this.verificationCode().trim();
    if (code.length < 6 || !this.confirmationResult) return;
    this.error.set('');
    this.loadingVerify.set(true);
    try {
      await this.firebaseService.setSessionPersistence(true);
      await this.firebaseService.verifyPhoneCode(this.confirmationResult, code);
      this.router.navigate(['/feed']);
    } catch (err: any) {
      this.loadingVerify.set(false);
      this.error.set(err?.message || 'Código incorrecto o expirado. Intenta de nuevo.');
    }
  }
}
