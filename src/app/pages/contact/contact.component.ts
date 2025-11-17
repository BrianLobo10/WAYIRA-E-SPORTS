import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SectionHeaderComponent } from '../../components/section-header/section-header.component';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule, SectionHeaderComponent],
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.css']
})
export class ContactComponent {
  name = signal('');
  email = signal('');
  subject = signal('');
  message = signal('');
  contactType = signal('suggestion');
  
  isSubmitting = signal(false);
  submitSuccess = signal(false);
  submitError = signal('');

  contactTypes = [
    { value: 'suggestion', label: 'Sugerencia', icon: 'lightbulb' },
    { value: 'bug', label: 'Reportar Bug', icon: 'bug' },
    { value: 'feature', label: 'Solicitar Función', icon: 'sparkles' },
    { value: 'partnership', label: 'Colaboración', icon: 'handshake' },
    { value: 'other', label: 'Otro', icon: 'document' }
  ];

  contactInfo = {
    email: 'wayirasports@gmail.com',
    phone: '+57 301 745 5742',
    discord: 'https://discord.gg/HHBMumv8S',
    facebook: 'https://www.facebook.com/share/1TtgfPoLSL/',
    instagram: 'https://www.instagram.com/wayiraesports'
  };

  onSubmit() {
    if (!this.validateForm()) return;

    this.isSubmitting.set(true);
    this.submitError.set('');

    setTimeout(() => {
      this.isSubmitting.set(false);
      this.submitSuccess.set(true);
      this.resetForm();
    }, 2000);
  }

  private validateForm(): boolean {
    if (!this.name().trim()) {
      this.submitError.set('El nombre es requerido');
      return false;
    }
    if (!this.email().trim()) {
      this.submitError.set('El email es requerido');
      return false;
    }
    if (!this.isValidEmail(this.email())) {
      this.submitError.set('El email no es válido');
      return false;
    }
    if (!this.message().trim()) {
      this.submitError.set('El mensaje es requerido');
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
      button.style.background = '#4ade80';
      setTimeout(() => {
        button.textContent = originalText;
        button.style.background = '';
      }, 2000);
    });
  }
}
