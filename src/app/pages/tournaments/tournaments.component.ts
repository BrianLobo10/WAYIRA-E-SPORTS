import { Component, signal, inject, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FirebaseService, Tournament, UserProfile, Team } from '../../services/firebase.service';
import { Timestamp } from '@angular/fire/firestore';
import { Subscription, debounceTime, distinctUntilChanged, Subject } from 'rxjs';

@Component({
  selector: 'app-tournaments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tournaments.component.html',
  styleUrls: ['./tournaments.component.css']
})
export class TournamentsComponent implements OnInit, OnDestroy {
  private firebaseService = inject(FirebaseService);
  private router = inject(Router);
  private subscriptions = new Subscription();

  tournaments = signal<Tournament[]>([]);
  loading = signal(true);
  currentUser = signal<UserProfile | null>(null);
  isAdmin = signal(false);
  
  // Create tournament modal
  showCreateModal = signal(false);
  creating = signal(false);
  
  // Register team modal
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  showRegisterModal = signal(false);
  registering = signal(false);
  selectedTournament = signal<Tournament | null>(null);
  teamName = signal('');
  searchTerm = signal('');
  searchResults = signal<UserProfile[]>([]);
  selectedPlayers = signal<UserProfile[]>([]);
  maxPlayers = 5; // Para LoL
  private searchSubject = new Subject<string>();
  
  // Bracket view
  selectedTournamentForBracket = signal<Tournament | null>(null);
  showBracket = signal(false);
  
  // Form fields
  tournamentName = signal('');
  tournamentDescription = signal('');
  tournamentGame = signal('League of Legends');
  tournamentStartDate = signal('');
  tournamentEndDate = signal('');
  tournamentMaxTeams = signal(16);

  games = [
    'League of Legends',
    'Valorant',
    'Counter-Strike 2',
    'Dota 2',
    'Rocket League',
    'FIFA',
    'Call of Duty',
    'Overwatch 2',
    'Apex Legends',
    'Rainbow Six Siege'
  ];

  teamCounts = [8, 16, 32, 64];

  async ngOnInit() {
    await this.checkAdminStatus();
    this.loadTournaments();
    
    // Verificar si hay queryParams para abrir el modal de creación
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('create') === 'true' && this.isAdmin()) {
      this.openCreateModal();
      // Limpiar el query param
      window.history.replaceState({}, '', window.location.pathname);
    }
    
    // Configurar debounce para la búsqueda
    this.subscriptions.add(
      this.searchSubject.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ).subscribe(term => {
        this.performSearch(term);
      })
    );
  }

  async checkAdminStatus() {
    const user = this.firebaseService.getCurrentUser();
    if (user) {
      const profile = await this.firebaseService.getUserProfile(user.uid);
      this.currentUser.set(profile);
      if (profile) {
        const admin = await this.firebaseService.isAdmin(user.uid);
        this.isAdmin.set(admin);
      }
    }
  }

  loadTournaments() {
    this.loading.set(true);
    this.firebaseService.getTournaments().subscribe({
      next: (tournaments) => {
        this.tournaments.set(tournaments);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  openCreateModal() {
    if (!this.isAdmin()) {
      alert('Solo los administradores pueden crear torneos');
      return;
    }
    this.resetForm();
    this.showCreateModal.set(true);
  }

  closeModal() {
    this.showCreateModal.set(false);
    this.resetForm();
  }

  resetForm() {
    this.tournamentName.set('');
    this.tournamentDescription.set('');
    this.tournamentGame.set('League of Legends');
    this.tournamentStartDate.set('');
    this.tournamentEndDate.set('');
    this.tournamentMaxTeams.set(16);
  }

  async createTournament() {
    const user = this.firebaseService.getCurrentUser();
    if (!user || !this.currentUser()) return;

    // Verificar que sea admin
    if (!this.isAdmin()) {
      alert('Solo los administradores pueden crear torneos');
      return;
    }

    if (!this.tournamentName().trim() || !this.tournamentDescription().trim() || 
        !this.tournamentStartDate() || !this.tournamentEndDate()) {
      alert('Por favor completa todos los campos requeridos');
      return;
    }

    const startDate = new Date(this.tournamentStartDate());
    const endDate = new Date(this.tournamentEndDate());

    if (endDate <= startDate) {
      alert('La fecha de finalización debe ser posterior a la fecha de inicio');
      return;
    }

    this.creating.set(true);
    try {
      await this.firebaseService.createTournament({
        name: this.tournamentName(),
        description: this.tournamentDescription(),
        game: this.tournamentGame(),
        startDate: Timestamp.fromDate(startDate),
        endDate: Timestamp.fromDate(endDate),
        maxTeams: this.tournamentMaxTeams(),
        createdBy: user.uid
      });
      
      this.closeModal();
      this.loadTournaments();
      alert('Torneo creado exitosamente');
    } catch (error) {
      console.error('Error creating tournament:', error);
      alert('Error al crear el torneo. Por favor intenta nuevamente.');
    } finally {
      this.creating.set(false);
    }
  }

  formatDate(timestamp: any): string {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('es-ES', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'ongoing':
        return 'status-ongoing';
      case 'finished':
        return 'status-finished';
      default:
        return 'status-upcoming';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'ongoing':
        return 'En Curso';
      case 'finished':
        return 'Finalizado';
      case 'confirmed':
        return 'Confirmado';
      default:
        return 'Próximamente';
    }
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  openRegisterModal(tournament: Tournament) {
    const user = this.firebaseService.getCurrentUser();
    if (!user) {
      alert('Debes iniciar sesión para registrarte');
      this.router.navigate(['/login']);
      return;
    }
    
    // Verificar si el usuario ya está registrado
    const teams = tournament.teams || [];
    const userAlreadyRegistered = teams.some(team => 
      team.captainId === user.uid || team.players.includes(user.uid)
    );
    
    if (userAlreadyRegistered) {
      alert('Ya estás registrado en este torneo');
      return;
    }
    
    this.selectedTournament.set(tournament);
    this.resetRegisterForm();
    this.showRegisterModal.set(true);
    
    // Enfocar el input de búsqueda después de abrir el modal
    setTimeout(() => {
      if (this.searchInput && this.searchInput.nativeElement) {
        this.searchInput.nativeElement.focus();
      }
    }, 300);
  }

  closeRegisterModal() {
    this.showRegisterModal.set(false);
    this.resetRegisterForm();
    this.selectedTournament.set(null);
  }

  resetRegisterForm() {
    this.teamName.set('');
    this.searchTerm.set('');
    this.searchResults.set([]);
    this.selectedPlayers.set([]);
  }

  onSearchChange() {
    const term = this.searchTerm().trim();
    if (term.length < 2) {
      this.searchResults.set([]);
      return;
    }
    // Emitir al subject para aplicar debounce
    this.searchSubject.next(term);
  }

  private performSearch(term: string) {
    if (term.length < 2) {
      this.searchResults.set([]);
      return;
    }
    
    this.firebaseService.searchUsers(term, 10).subscribe({
      next: (users) => {
        const currentUserId = this.firebaseService.getCurrentUser()?.uid;
        // Filtrar el usuario actual y los ya seleccionados
        const filtered = users.filter(user => 
          user.uid !== currentUserId && 
          !this.selectedPlayers().some(p => p.uid === user.uid)
        );
        this.searchResults.set(filtered);
      },
      error: (error) => {
        console.error('Error searching users:', error);
        this.searchResults.set([]);
      }
    });
  }

  addPlayer(player: UserProfile) {
    if (this.selectedPlayers().length >= this.maxPlayers) {
      alert(`Solo puedes agregar ${this.maxPlayers} jugadores`);
      return;
    }
    
    if (this.selectedPlayers().some(p => p.uid === player.uid)) {
      alert('Este jugador ya está en tu equipo');
      return;
    }
    
    this.selectedPlayers.set([...this.selectedPlayers(), player]);
    this.searchTerm.set('');
    this.searchResults.set([]);
    
    // Mantener el foco en el input para seguir buscando
    setTimeout(() => {
      if (this.searchInput && this.searchInput.nativeElement) {
        this.searchInput.nativeElement.focus();
      }
    }, 100);
  }

  removePlayer(player: UserProfile) {
    this.selectedPlayers.set(this.selectedPlayers().filter(p => p.uid !== player.uid));
  }

  async registerTeam() {
    const user = this.firebaseService.getCurrentUser();
    const tournament = this.selectedTournament();
    
    if (!user || !tournament || !this.currentUser()) return;
    
    if (!this.teamName().trim()) {
      alert('Por favor ingresa un nombre para tu equipo');
      return;
    }
    
    if (this.selectedPlayers().length < this.maxPlayers) {
      alert(`Necesitas ${this.maxPlayers} jugadores para completar tu equipo`);
      return;
    }
    
    this.registering.set(true);
    try {
      const team: Team = {
        id: `team-${Date.now()}`,
        name: this.teamName(),
        captainId: user.uid,
        captainName: this.currentUser()!.displayName,
        players: [user.uid, ...this.selectedPlayers().map(p => p.uid)],
        substitutes: [],
        registeredAt: Timestamp.now()
      };
      
      await this.firebaseService.registerTeam(tournament.id!, team);
      
      // Verificar si todos los equipos están completos
      const updatedTournament = await new Promise<Tournament | null>((resolve) => {
        this.firebaseService.getTournamentById(tournament.id!).subscribe({
          next: (t) => resolve(t),
          error: () => resolve(null)
        });
      });
      
      if (updatedTournament) {
        const teams = updatedTournament.teams || [];
        const allTeamsComplete = teams.length === updatedTournament.maxTeams &&
          teams.every(t => t.players.length >= this.maxPlayers);
        
        if (allTeamsComplete && !updatedTournament.confirmed) {
          // Generar bracket automáticamente
          const bracket = this.firebaseService.generateBracket(updatedTournament.teams);
          await this.firebaseService.updateTournament(tournament.id!, {
            confirmed: true,
            confirmedAt: Timestamp.now(),
            bracket: bracket
          });
        }
      }
      
      this.closeRegisterModal();
      this.loadTournaments();
      alert('Equipo registrado exitosamente');
    } catch (error) {
      console.error('Error registering team:', error);
      alert('Error al registrar el equipo. Por favor intenta nuevamente.');
    } finally {
      this.registering.set(false);
    }
  }

  viewBracket(tournament: Tournament) {
    this.selectedTournamentForBracket.set(tournament);
    this.showBracket.set(true);
  }

  closeBracket() {
    this.showBracket.set(false);
    this.selectedTournamentForBracket.set(null);
  }

  async startTournament(tournament: Tournament) {
    if (!confirm('¿Estás seguro de iniciar este torneo? Esto generará el bracket final.')) {
      return;
    }
    
    try {
      const bracket = this.firebaseService.generateBracket(tournament.teams);
      await this.firebaseService.updateTournament(tournament.id!, {
        status: 'ongoing',
        bracket: bracket
      });
      this.loadTournaments();
      alert('Torneo iniciado exitosamente');
    } catch (error) {
      console.error('Error starting tournament:', error);
      alert('Error al iniciar el torneo');
    }
  }

  async updateMatchWinner(matchId: string, winnerId: string) {
    const tournament = this.selectedTournamentForBracket();
    if (!tournament || !tournament.bracket) return;
    
    const updatedBracket = tournament.bracket.map(match => {
      if (match.id === matchId) {
        return { ...match, winnerId };
      }
      return match;
    });
    
    try {
      await this.firebaseService.updateTournament(tournament.id!, {
        bracket: updatedBracket
      });
      this.loadTournaments();
    } catch (error) {
      console.error('Error updating match:', error);
      alert('Error al actualizar el resultado');
    }
  }

  getRoundName(round: string): string {
    switch (round) {
      case 'final':
        return 'Final';
      case 'semi':
        return 'Semifinal';
      case 'quarter':
        return 'Cuartos';
      case 'round16':
        return 'Octavos';
      default:
        return round;
    }
  }

  async createPracticeTournament() {
    if (!this.isAdmin()) {
      alert('Solo los administradores pueden crear torneos');
      return;
    }
    
    if (!confirm('¿Crear un torneo de práctica para probar el sistema?')) {
      return;
    }
    
    const user = this.firebaseService.getCurrentUser();
    if (!user) return;
    
    this.creating.set(true);
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 7); // 7 días desde ahora
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 14); // 14 días después
      
      await this.firebaseService.createTournament({
        name: 'Torneo de Práctica - Wayira',
        description: 'Torneo de práctica para probar el sistema de registro de equipos y bracket',
        game: 'League of Legends',
        startDate: Timestamp.fromDate(startDate),
        endDate: Timestamp.fromDate(endDate),
        maxTeams: 8,
        createdBy: user.uid
      });
      
      this.loadTournaments();
      alert('Torneo de práctica creado exitosamente');
    } catch (error) {
      console.error('Error creating practice tournament:', error);
      alert('Error al crear el torneo de práctica');
    } finally {
      this.creating.set(false);
    }
  }
}

