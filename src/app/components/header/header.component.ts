import { Component, HostListener, ElementRef, ViewChild } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  @ViewChild('navElement') navElement!: ElementRef;
  
  menuOpen = false;
  dropdownOpen = false;

  constructor(private router: Router) {}

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

