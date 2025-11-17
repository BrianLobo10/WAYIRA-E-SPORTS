import { Component, HostListener, ElementRef, ViewChild, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { User } from '@angular/fire/auth';
import { FirebaseService, UserProfile, Tournament } from '@/app/services/firebase.service';
import { NotificationsComponent } from '../notifications/notifications.component';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, CommonModule, NotificationsComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit, OnDestroy {
  @ViewChild('navElement') navElement!: ElementRef;
  
  private firebaseService: FirebaseService = inject(FirebaseService);
  private router: Router = inject(Router);
  private subscriptions = new Subscription();
  private profileSubscription: Subscription | null = null;
  
  menuOpen = false;
  dropdownOpen = false;
  moreDropdownOpen = false;
  profileDropdownOpen = false;
  currentUser = signal<UserProfile | null>(null);
  isAuthenticated = signal(false);
  isAdmin = signal(false);
  activeTournament = signal<Tournament | null>(null);
  hasAvailableTournaments = signal(false);

  ngOnInit() {
    // Cargar perfil inmediatamente si ya hay un usuario autenticado
    const currentUser = this.firebaseService.getCurrentUser();
    if (currentUser) {
      this.isAuthenticated.set(true);
      this.loadUserProfile(currentUser.uid);
      // Suscribirse a cambios en tiempo real del perfil
      this.subscribeToUserProfile(currentUser.uid);
    }
    
    this.subscriptions.add(
      this.firebaseService.currentUser.subscribe((user: User | null) => {
        console.log('Header: Auth state changed, user:', user?.uid);
        this.isAuthenticated.set(!!user);
        if (user) {
          this.loadUserProfile(user.uid);
          // Suscribirse a cambios en tiempo real del perfil
          this.subscribeToUserProfile(user.uid);
        } else {
          // Limpiar suscripción del perfil cuando el usuario cierra sesión
          if (this.profileSubscription) {
            this.profileSubscription.unsubscribe();
            this.profileSubscription = null;
          }
          this.currentUser.set(null);
          this.isAdmin.set(false);
        }
      })
    );
    
    // Cargar torneo activo después de un pequeño delay para evitar problemas de contexto de inyección
    setTimeout(() => {
      this.subscriptions.add(
        this.firebaseService.getActiveTournament().subscribe({
          next: (tournament) => {
            this.activeTournament.set(tournament);
          },
          error: (error) => {
            console.error('Error loading active tournament:', error);
          }
        })
      );
      
      // Verificar si hay torneos disponibles (upcoming, ongoing, confirmed)
      this.subscriptions.add(
        this.firebaseService.hasAvailableTournaments().subscribe({
          next: (hasTournaments) => {
            this.hasAvailableTournaments.set(hasTournaments);
          },
          error: (error) => {
            console.error('Error checking available tournaments:', error);
            this.hasAvailableTournaments.set(false);
          }
        })
      );
    }, 0);
  }

  subscribeToUserProfile(uid: string) {
    // Limpiar suscripción anterior si existe
    if (this.profileSubscription) {
      this.profileSubscription.unsubscribe();
      this.profileSubscription = null;
    }
    
    // Crear nueva suscripción
    this.profileSubscription = this.firebaseService.getUserProfileRealtime(uid).subscribe({
      next: (profile) => {
        if (profile) {
          this.currentUser.set(profile);
          this.isAdmin.set(profile.role === 'admin');
        } else {
          this.currentUser.set(null);
          this.isAdmin.set(false);
        }
      },
      error: (error) => {
        console.error('Error in real-time profile subscription:', error);
      }
    });
    
    // Agregar a subscriptions para limpieza automática
    this.subscriptions.add(this.profileSubscription);
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  async loadUserProfile(uid: string) {
    try {
      console.log('Header: Loading profile for uid:', uid);
      const profile = await this.firebaseService.getUserProfile(uid);
      console.log('Header: Profile loaded:', profile);
      
      if (profile) {
        this.currentUser.set(profile);
        // Verificar admin directamente desde el perfil en lugar de hacer otra consulta
        const admin = profile.role === 'admin';
        this.isAdmin.set(admin);
        console.log('Header: Admin status:', admin, 'Profile role:', profile.role, 'UID:', profile.uid);
      } else {
        console.warn('Header: Profile is null for uid:', uid);
        console.warn('Header: This might mean the user profile does not exist in Firestore for this Firebase Auth uid.');
        console.warn('Header: Please check if the user was registered correctly or if the uid matches.');
        this.currentUser.set(null);
        this.isAdmin.set(false);
      }
    } catch (error) {
      console.error('Header: Error loading user profile:', error);
      this.currentUser.set(null);
      this.isAdmin.set(false);
    }
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

  toggleMoreDropdown() {
    this.moreDropdownOpen = !this.moreDropdownOpen;
  }

  closeMoreDropdown() {
    this.moreDropdownOpen = false;
  }

  toggleProfileDropdown() {
    this.profileDropdownOpen = !this.profileDropdownOpen;
  }

  closeProfileDropdown() {
    this.profileDropdownOpen = false;
  }

  closeMenu() {
    this.menuOpen = false;
    this.dropdownOpen = false;
    this.moreDropdownOpen = false;
    this.profileDropdownOpen = false;
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
      this.closeMoreDropdown();
      this.closeProfileDropdown();
    }
  }
}

