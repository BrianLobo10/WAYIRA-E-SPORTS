import { Component, HostListener, ElementRef, ViewChild, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { User } from '@angular/fire/auth';
import { FirebaseService, UserProfile, Tournament } from '@/app/services/firebase.service';
import { readCachedUserProfile, writeCachedUserProfile } from '@/app/utils/profile-view-cache';
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
  unreadMessagesCount = signal(0);

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
        this.isAuthenticated.set(!!user);
        if (user) {
          this.loadUserProfile(user.uid);
          this.subscribeToUserProfile(user.uid);
          this.subscriptions.add(
            this.firebaseService.getUnreadMessagesCount(user.uid).subscribe({
              next: (count) => this.unreadMessagesCount.set(count),
              error: (error) => console.error('Error cargando contador de mensajes no leídos:', error)
            })
          );
        } else {
          if (this.profileSubscription) {
            this.profileSubscription.unsubscribe();
            this.profileSubscription = null;
          }
          this.currentUser.set(null);
          this.isAdmin.set(false);
          this.unreadMessagesCount.set(0);
        }
      })
    );

    this.subscriptions.add(
      this.firebaseService.getActiveTournament().subscribe({
        next: (tournament) => this.activeTournament.set(tournament),
        error: (error) => console.error('Error loading active tournament:', error)
      })
    );

    this.subscriptions.add(
      this.firebaseService.hasAvailableTournaments().subscribe({
        next: (hasTournaments) => this.hasAvailableTournaments.set(hasTournaments),
        error: () => this.hasAvailableTournaments.set(false)
      })
    );
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
          writeCachedUserProfile(uid, profile);
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

  /** Al volver a la pestaña, refrescar perfil por si cambiaron el role en Firestore. */
  @HostListener('document:visibilitychange')
  onVisibilityChange() {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      const user = this.firebaseService.getCurrentUser();
      if (user) this.loadUserProfile(user.uid);
    }
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  async loadUserProfile(uid: string) {
    const cached = readCachedUserProfile(uid);
    if (cached) {
      this.currentUser.set(cached);
      this.isAdmin.set(cached.role === 'admin');
    }
    try {
      const profile = await this.firebaseService.getUserProfile(uid);

      if (profile) {
        this.currentUser.set(profile);
        writeCachedUserProfile(uid, profile);
        const admin = profile.role === 'admin';
        this.isAdmin.set(admin);
        if (!admin) {
          console.log('Header: No admin. Para ver "Crear Torneo" pon role: "admin" en Firestore → users →', uid);
        }
      } else {
        this.currentUser.set(null);
        this.isAdmin.set(false);
      }
    } catch (error) {
      console.error('Header: Error loading user profile:', error);
      if (!cached) {
        this.currentUser.set(null);
        this.isAdmin.set(false);
      }
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

  closeMobileNav() {
    this.closeMenu();
  }

  openMoreDropdown() {
    this.moreDropdownOpen = true;
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

