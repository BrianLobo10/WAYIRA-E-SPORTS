import { Component, HostListener, ElementRef, ViewChild, inject, signal, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { User } from '@angular/fire/auth';
import { FirebaseService, UserProfile } from '@/app/services/firebase.service';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit {
  @ViewChild('navElement') navElement!: ElementRef;
  
  private firebaseService: FirebaseService = inject(FirebaseService);
  private router: Router = inject(Router);
  
  menuOpen = false;
  dropdownOpen = false;
  currentUser = signal<UserProfile | null>(null);
  isAuthenticated = signal(false);

  ngOnInit() {
    this.firebaseService.currentUser.subscribe((user: User | null) => {
      this.isAuthenticated.set(!!user);
      if (user) {
        this.loadUserProfile(user.uid);
      } else {
        this.currentUser.set(null);
      }
    });
  }

  async loadUserProfile(uid: string) {
    const profile = await this.firebaseService.getUserProfile(uid);
    this.currentUser.set(profile);
  }

  async logout() {
    await this.firebaseService.logout();
    this.router.navigate(['/']);
  }

  isHomePage(): boolean {
    return this.router.url === '/';
  }

  toggleMenu() {
    console.log('toggleMenu called, current state:', this.menuOpen);
    this.menuOpen = !this.menuOpen;
    console.log('new menu state:', this.menuOpen);
    if (this.menuOpen) {
      this.dropdownOpen = false;
    }
  }

  toggleDropdown() {
    console.log('toggleDropdown called, current state:', this.dropdownOpen);
    this.dropdownOpen = !this.dropdownOpen;
    console.log('new state:', this.dropdownOpen);
  }

  closeDropdown() {
    this.dropdownOpen = false;
  }

  closeMenu() {
    this.menuOpen = false;
    this.dropdownOpen = false;
  }

  scrollToSection(sectionId: string) {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    this.closeMenu();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    const isMenuToggle = target.closest('.menu-toggle');
    const isNavElement = this.navElement && this.navElement.nativeElement.contains(target);
    
    if (!isMenuToggle && !isNavElement) {
      this.closeMenu();
      this.closeDropdown();
    }
  }
}

