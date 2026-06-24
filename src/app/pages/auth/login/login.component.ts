import { Component, signal, inject, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FirebaseService } from '../../../services/firebase.service';
import { SecureStorageService } from '../../../services/secure-storage.service';
import { getStoredReturnUrl } from '../../../guards/session.guard';
import { Auth } from '@angular/fire/auth';
import { RecaptchaVerifier } from 'firebase/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit, AfterViewInit, OnDestroy {
  phone = signal('');
  verificationCode = signal('');
  codeSent = signal(false);
  rememberMe = signal(true);
  loadingSocial = signal(false);
  loadingPhone = signal(false);
  loadingVerify = signal(false);
  error = signal('');

  private firebaseService = inject(FirebaseService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private storage = inject(SecureStorageService);
  private auth = inject(Auth);
  private recaptchaVerifier: RecaptchaVerifier | null = null;
  private confirmationResult: any = null;

  ngOnInit() {
    const user = this.firebaseService.getCurrentUser();
    if (user) {
      this.redirectAfterLogin();
      return;
    }
    this.firebaseService.currentUser.subscribe(user => {
      if (user) this.redirectAfterLogin();
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
      this.recaptchaVerifier = new RecaptchaVerifier(this.auth, 'recaptcha-phone-container', {
        size: 'invisible',
        callback: () => {}
      });
    } catch (e) {
      console.warn('RecaptchaVerifier init:', e);
    }
  }

  private redirectAfterLogin() {
    const r = this.route.snapshot.queryParams['r'] ?? null;
    const returnUrl = getStoredReturnUrl(r, this.storage);
    this.router.navigateByUrl(returnUrl, { replaceUrl: true });
  }

  async onLoginWithGoogle() {
    this.error.set('');
    this.loadingSocial.set(true);
    try {
      await this.firebaseService.setSessionPersistence(this.rememberMe());
      await this.firebaseService.loginWithGoogle();
      this.redirectAfterLogin();
    } catch (err: any) {
      this.loadingSocial.set(false);
      if (err?.code === 'auth/popup-closed-by-user') return;
      this.error.set(err?.message || 'No se pudo iniciar sesión con Google.');
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
      await this.firebaseService.setSessionPersistence(this.rememberMe());
      await this.firebaseService.verifyPhoneCode(this.confirmationResult, code);
      this.redirectAfterLogin();
    } catch (err: any) {
      this.loadingVerify.set(false);
      this.error.set(err?.message || 'Código incorrecto o expirado. Intenta de nuevo.');
    }
  }
}
