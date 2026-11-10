import { Component, HostListener, ElementRef, ViewChild, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import type { Tournament } from '@/app/models';
import { TournamentService } from '@/app/services/tournament.service';
import { AuthService } from '@/app/services/auth.service';
import { MessagingService } from '@/app/services/messaging.service';
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
  
  private tournamentApi = inject(TournamentService);
  private router: Router = inject(Router);
  private auth = inject(AuthService);
  private subscriptions = new Subscription();
  
  menuOpen = false;
  dropdownOpen = false;
  moreDropdownOpen = false;
  profileDropdownOpen = false;
  /** Sesión de Supabase (Google o Discord) y perfil público */
  isAuthenticated = this.auth.isAuthenticated;
  currentUser = computed(() => {
    const p = this.auth.profile();
    const u = this.auth.user();
    if (!u) return null;
    return {
      uid: u.id,
      displayName: p?.display_name ?? 'Jugador',
      photoURL: p?.avatar_url ?? undefined,
    };
  });
  /** Staff: cualquier permiso de gestión (solo para mostrar opciones; la seguridad está en el servidor) */
  isAdmin = computed(() => this.auth.permissions().length > 0);
  isSuperadmin = computed(() => this.auth.hasPermission('platform.stats'));
  activeTournament = signal<Tournament | null>(null);
  hasAvailableTournaments = signal(false);
  /** Mensajes sin leer (se actualiza en tiempo real desde la campana de notificaciones) */
  unreadMessagesCount = inject(MessagingService).unreadMessages;

  ngOnInit() {
    this.subscriptions.add(
      this.tournamentApi.getActiveTournament().subscribe({
        next: (tournament) => this.activeTournament.set(tournament),
        error: (error) => console.error('Error loading active tournament:', error)
      })
    );

    this.subscriptions.add(
      this.tournamentApi.hasAvailableTournaments().subscribe({
        next: (hasTournaments) => this.hasAvailableTournaments.set(hasTournaments),
        error: () => this.hasAvailableTournaments.set(false)
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  async logout() {
    await this.auth.signOut();
    this.router.navigate(['/']);
  }

  isHomePage(): boolean {
    return this.router.url === '/';
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) {
      this.dropdownOpen = false;
    }
    this.syncScrollLock();
  }

  private syncScrollLock() {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('nav-open', this.menuOpen);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.menuOpen || this.moreDropdownOpen || this.profileDropdownOpen) {
      this.closeMenu();
    }
  }

  toggleDropdown() {
    this.dropdownOpen = !this.dropdownOpen;
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

  openProfileDropdown() {
    this.profileDropdownOpen = true;
  }

  closeProfileDropdown() {
    this.profileDropdownOpen = false;
  }

  closeMenu() {
    this.menuOpen = false;
    this.dropdownOpen = false;
    this.moreDropdownOpen = false;
    this.profileDropdownOpen = false;
    this.syncScrollLock();
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
    const isProfileMenu = target.closest('.header-profile');

    if (!isMenuToggle && !isNavElement && !isProfileMenu) {
      this.closeMenu();
      this.closeDropdown();
      this.closeMoreDropdown();
      this.closeProfileDropdown();
    }
  }
}
