import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { UserProfile } from '../../models';
import { ContentService } from '../../services/content.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.css']
})
export class ContactComponent implements OnInit {
  private content = inject(ContentService);
  private auth = inject(AuthService);

  name = signal('');
  email = signal('');
  subject = signal('');
  message = signal('');
  contactType = signal('general');
  
  isSubmitting = signal(false);
  submitSuccess = signal(false);
  submitError = signal('');
  currentUser = signal<UserProfile | null>(null);

  contactTypes = [
    { value: 'general', label: 'Consulta general' },
    { value: 'support', label: 'Soporte técnico' },
    { value: 'other', label: 'Otro' }
  ];

  contactInfo = {
    email: 'wayirasports@gmail.com',
    phone: '+57 301 745 5742',
    discord: 'https://discord.com/invite/WZHESnGACq',
    facebook: 'https://www.facebook.com/share/1TtgfPoLSL/',
    instagram: 'https://www.instagram.com/wayiraesports'
  };

  async ngOnInit() {
    // Con sesión, se autocompletan nombre y correo (el correo solo lo ve la propia persona)
    await this.auth.waitForInit();
    const user = this.auth.user();
    if (user) {
      this.name.set(this.auth.profile()?.display_name ?? '');
      this.email.set(user.email ?? '');
    }
  }


  async onSubmit() {
    if (!this.validateForm()) return;

    this.isSubmitting.set(true);
    this.submitError.set('');

    try {
      // Guardar mensaje en Firestore
      // Se guarda en el buzón; el staff lo lee en el panel de staff
      await this.content.sendContactMessage({
        name: this.name(),
        email: this.email(),
        subject: this.subject() || undefined,
        message: this.message(),
        contactType: this.contactType()
      });

      this.isSubmitting.set(false);
      this.submitSuccess.set(true);
      this.resetForm();
    } catch (error: any) {
      console.error('Error al enviar mensaje:', error);
      this.submitError.set(error instanceof Error ? error.message : 'Error al enviar el mensaje. Por favor intenta nuevamente.');
      this.isSubmitting.set(false);
    }
  }

  private validateForm(): boolean {
    // Validación simplificada ya que nombre y email vienen del perfil
    if (!this.message().trim()) {
      this.submitError.set('El mensaje es requerido');
      return false;
    }
    // Verificar que tenemos los datos del usuario
    if (!this.name().trim() || !this.email().trim()) {
      this.submitError.set('Error al cargar tu información. Por favor recarga la página.');
      return false;
    }
    return true;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private resetForm() {
    this.name.set('');
    this.email.set('');
    this.subject.set('');
    this.message.set('');
    this.contactType.set('suggestion');
  }

  goToLink(url: string) {
    window.open(url, '_blank');
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      const button = event?.target as HTMLElement;
      const originalText = button.textContent;
      button.textContent = '¡Copiado!';
      button.style.background = '#d7ff3f';
      setTimeout(() => {
        button.textContent = originalText;
        button.style.background = '';
      }, 2000);
    });
  }
}
