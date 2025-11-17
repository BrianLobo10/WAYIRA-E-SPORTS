import { Component, signal, inject, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FirebaseService, Tournament, UserProfile, Team, BracketMatch } from '../../services/firebase.service';
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
  
  // Delete tournament
  deletingTournamentId = signal<string | null>(null);
  
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
    this.selectedTournament.set(null); // Limpiar torneo en edición
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
      const tournamentToEdit = this.selectedTournament();
      
      if (tournamentToEdit && tournamentToEdit.id) {
        // Actualizar torneo existente
        await this.firebaseService.updateTournament(tournamentToEdit.id, {
          name: this.tournamentName(),
          description: this.tournamentDescription(),
          game: this.tournamentGame(),
          startDate: Timestamp.fromDate(startDate),
          endDate: Timestamp.fromDate(endDate),
          maxTeams: this.tournamentMaxTeams()
        });
        
        this.closeModal();
        this.loadTournaments();
        alert('Torneo actualizado exitosamente');
      } else {
        // Crear nuevo torneo
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
      }
    } catch (error) {
      console.error('Error creating/updating tournament:', error);
      alert('Error al guardar el torneo. Por favor intenta nuevamente.');
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
    
    // Encontrar el partido actual
    const currentMatch = tournament.bracket.find(m => m.id === matchId);
    if (!currentMatch) return;
    
    // Obtener información del ganador
    const winnerName = winnerId === currentMatch.team1Id ? currentMatch.team1Name : currentMatch.team2Name;
    const winnerScore = winnerId === currentMatch.team1Id ? currentMatch.score1 : currentMatch.score2;
    const loserScore = winnerId === currentMatch.team1Id ? currentMatch.score2 : currentMatch.score1;
    
    // Actualizar el partido actual
    const updatedBracket = tournament.bracket.map(match => {
      if (match.id === matchId) {
        return { 
          ...match, 
          winnerId,
          score1: winnerId === match.team1Id ? (match.score1 || 1) : (match.score1 || 0),
          score2: winnerId === match.team2Id ? (match.score2 || 1) : (match.score2 || 0)
        };
      }
      return match;
    });
    
    // Avanzar el ganador a la siguiente ronda automáticamente
    const nextRoundMatches = this.getNextRoundMatches(currentMatch.round, updatedBracket);
    
    if (nextRoundMatches.length > 0) {
      // Obtener todos los partidos de la ronda actual ordenados
      const currentRoundMatches = updatedBracket
        .filter(m => m.round === currentMatch.round)
        .sort((a, b) => a.id.localeCompare(b.id));
      
      const currentIndex = currentRoundMatches.findIndex(m => m.id === matchId);
      
      // Calcular a qué partido de la siguiente ronda debe avanzar
      const targetNextIndex = Math.floor(currentIndex / 2);
      
      if (targetNextIndex < nextRoundMatches.length) {
        const targetNextMatch = nextRoundMatches[targetNextIndex];
        const matchIndex = updatedBracket.findIndex(m => m.id === targetNextMatch.id);
        
        if (matchIndex !== -1) {
          // Determinar si va en team1 (primera mitad) o team2 (segunda mitad)
          const isFirstHalf = currentIndex % 2 === 0;
          
          if (isFirstHalf) {
            // Reemplazar team1 si es TBD o está vacío
            if (!targetNextMatch.team1Name || targetNextMatch.team1Name === 'TBD') {
              updatedBracket[matchIndex] = {
                ...updatedBracket[matchIndex],
                team1Id: winnerId,
                team1Name: winnerName
              };
            }
          } else {
            // Reemplazar team2 si es TBD o está vacío
            if (!targetNextMatch.team2Name || targetNextMatch.team2Name === 'TBD') {
              updatedBracket[matchIndex] = {
                ...updatedBracket[matchIndex],
                team2Id: winnerId,
                team2Name: winnerName
              };
            }
          }
        }
      }
    }
    
    try {
      await this.firebaseService.updateTournament(tournament.id!, {
        bracket: updatedBracket
      });
      this.loadTournaments();
      
      // Actualizar el bracket visible
      const updatedTournament = await new Promise<Tournament | null>((resolve) => {
        this.firebaseService.getTournamentById(tournament.id!).subscribe({
          next: (t) => resolve(t),
          error: () => resolve(null)
        });
      });
      
      if (updatedTournament) {
        this.selectedTournamentForBracket.set(updatedTournament);
      }
    } catch (error) {
      console.error('Error updating match:', error);
      alert('Error al actualizar el resultado');
    }
  }

  private getNextRoundMatches(currentRound: string, bracket: BracketMatch[]): BracketMatch[] {
    const roundOrder = ['round16', 'quarter', 'semi', 'final'];
    const currentIndex = roundOrder.indexOf(currentRound);
    if (currentIndex === -1 || currentIndex === roundOrder.length - 1) return [];
    
    const nextRound = roundOrder[currentIndex + 1];
    return bracket
      .filter(m => m.round === nextRound)
      .sort((a, b) => a.id.localeCompare(b.id)); // Ordenar por ID para mantener consistencia
  }

  private shouldAdvanceWinnerToMatch(currentMatch: BracketMatch, nextMatch: BracketMatch, bracket: BracketMatch[]): boolean {
    // Obtener todos los partidos de la ronda actual y siguiente
    const currentRoundMatches = bracket.filter(m => m.round === currentMatch.round).sort((a, b) => a.id.localeCompare(b.id));
    const nextRoundMatches = bracket.filter(m => m.round === nextMatch.round).sort((a, b) => a.id.localeCompare(b.id));
    
    const currentIndex = currentRoundMatches.findIndex(m => m.id === currentMatch.id);
    const nextIndex = nextRoundMatches.findIndex(m => m.id === nextMatch.id);
    
    // Calcular a qué partido de la siguiente ronda debe avanzar
    const expectedNextIndex = Math.floor(currentIndex / 2);
    
    // Verificar si este es el partido correcto y si tiene espacio
    if (nextIndex === expectedNextIndex) {
      // Verificar si el partido tiene espacio (TBD o sin equipo)
      const isFirstHalf = currentIndex % 2 === 0;
      if (isFirstHalf) {
        return !nextMatch.team1Name || nextMatch.team1Name === 'TBD';
      } else {
        return !nextMatch.team2Name || nextMatch.team2Name === 'TBD';
      }
    }
    
    return false;
  }

  private isFirstHalfMatch(match: BracketMatch, bracket: BracketMatch[]): boolean {
    const sameRoundMatches = bracket.filter(m => m.round === match.round).sort((a, b) => a.id.localeCompare(b.id));
    const matchIndex = sameRoundMatches.findIndex(m => m.id === match.id);
    return matchIndex % 2 === 0; // Primera mitad si es par
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

  hasRoundMatches(round: string): boolean {
    const tournament = this.selectedTournamentForBracket();
    if (!tournament || !tournament.bracket) return false;
    return tournament.bracket.some(m => m.round === round);
  }

  getRoundMatches(round: string) {
    const tournament = this.selectedTournamentForBracket();
    if (!tournament || !tournament.bracket) return [];
    return tournament.bracket.filter(m => m.round === round);
  }

  getBracketRounds(): string[] {
    const tournament = this.selectedTournamentForBracket();
    if (!tournament || !tournament.bracket) return [];
    
    const rounds = ['round16', 'quarter', 'semi', 'final'];
    const existingRounds = rounds.filter(round => 
      tournament.bracket!.some(m => m.round === round)
    );
    return existingRounds;
  }

  getRoundDisplayName(round: string): string {
    return this.getRoundName(round);
  }

  async createPracticeTournament() {
    if (!this.isAdmin()) {
      alert('Solo los administradores pueden crear torneos');
      return;
    }
    
    if (!confirm('¿Crear un torneo de prueba completo con equipos ficticios y bracket para ver las clasificaciones?')) {
      return;
    }
    
    const user = this.firebaseService.getCurrentUser();
    if (!user) return;
    
    this.creating.set(true);
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1); // Mañana
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7); // 7 días después
      
      // Crear el torneo
      const tournamentId = await this.firebaseService.createTournament({
        name: 'Torneo de Prueba - Wayira E-Sports',
        description: 'Torneo de prueba con equipos ficticios (bots) y bracket completo para visualizar el organigrama y clasificaciones',
        game: 'League of Legends',
        startDate: Timestamp.fromDate(startDate),
        endDate: Timestamp.fromDate(endDate),
        maxTeams: 8,
        createdBy: user.uid
      });
      
      // Crear equipos ficticios (solo nombres, sin jugadores reales)
      const teamNames = [
        'Dragones Wayira',
        'Leones del Norte',
        'Águilas Doradas',
        'Tigres Rojos',
        'Lobos Plateados',
        'Halcones Azules',
        'Osos Poderosos',
        'Serpientes Venenosas'
      ];
      
      const teams: Team[] = teamNames.map((name, index) => ({
        id: `team-${tournamentId}-${index}`,
        name: name,
        captainId: `bot-captain-${index}`, // IDs ficticios
        captainName: `Bot ${name}`,
        players: [], // Sin jugadores reales, solo para visualización
        substitutes: [], // Array vacío para suplentes
        registeredAt: Timestamp.now()
      }));
      
      // Generar bracket
      const bracket = this.firebaseService.generateBracket(teams);
      
      // Agregar algunos resultados de ejemplo para mostrar el marcador
      // Cuartos de final - algunos con resultados
      const quarterFinals = bracket.filter(m => m.round === 'quarter');
      if (quarterFinals.length >= 2) {
        // Primer cuarto de final - completado con marcador
        quarterFinals[0].score1 = 2;
        quarterFinals[0].score2 = 1;
        quarterFinals[0].winnerId = quarterFinals[0].team1Id;
        
        // Segundo cuarto de final - completado con marcador
        quarterFinals[1].score1 = 0;
        quarterFinals[1].score2 = 2;
        quarterFinals[1].winnerId = quarterFinals[1].team2Id;
      }
      
      // Semifinales - una con resultado
      const semiFinals = bracket.filter(m => m.round === 'semi');
      if (semiFinals.length >= 1) {
        semiFinals[0].score1 = 2;
        semiFinals[0].score2 = 0;
        semiFinals[0].winnerId = semiFinals[0].team1Id;
      }
      
      // Limpiar valores undefined del bracket para Firestore
      const cleanBracket = bracket.map(match => {
        const cleanMatch: any = {
          id: match.id,
          round: match.round,
          team1Id: match.team1Id || null,
          team1Name: match.team1Name || null,
          team2Id: match.team2Id || null,
          team2Name: match.team2Name || null
        };
        
        if (match.score1 !== undefined) cleanMatch.score1 = match.score1;
        if (match.score2 !== undefined) cleanMatch.score2 = match.score2;
        if (match.winnerId) cleanMatch.winnerId = match.winnerId;
        if (match.matchDate) cleanMatch.matchDate = match.matchDate;
        
        return cleanMatch;
      });
      
      // Actualizar el torneo con equipos, bracket y confirmarlo
      await this.firebaseService.updateTournament(tournamentId, {
        teams: teams,
        bracket: cleanBracket,
        confirmed: true,
        confirmedAt: Timestamp.now(),
        status: 'ongoing' // Marcar como en curso para poder ver el bracket
      });
      
      this.loadTournaments();
      alert('Torneo de prueba creado exitosamente con 8 equipos ficticios y bracket completo. Puedes ver el organigrama y clasificaciones.');
    } catch (error: any) {
      console.error('Error creating practice tournament:', error);
      const errorMessage = error?.message || error?.toString() || 'Error desconocido';
      alert(`Error al crear el torneo de prueba: ${errorMessage}`);
    } finally {
      this.creating.set(false);
    }
  }

  editTournament(tournament: Tournament) {
    if (!this.isAdmin()) {
      alert('Solo los administradores pueden editar torneos');
      return;
    }
    
    // Cargar los datos del torneo en el formulario
    this.tournamentName.set(tournament.name);
    this.tournamentDescription.set(tournament.description);
    this.tournamentGame.set(tournament.game);
    this.tournamentMaxTeams.set(tournament.maxTeams);
    
    // Convertir timestamps a formato datetime-local
    const startDate = tournament.startDate.toDate();
    const endDate = tournament.endDate.toDate();
    
    // Formatear para input datetime-local (YYYY-MM-DDTHH:mm)
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };
    
    this.tournamentStartDate.set(formatDate(startDate));
    this.tournamentEndDate.set(formatDate(endDate));
    
    // Guardar el ID del torneo a editar
    this.selectedTournament.set(tournament);
    this.showCreateModal.set(true);
  }

  async deleteTournament(tournament: Tournament) {
    if (!this.isAdmin()) {
      alert('Solo los administradores pueden eliminar torneos');
      return;
    }
    
    if (!confirm(`¿Estás seguro de eliminar el torneo "${tournament.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    
    if (!tournament.id) {
      alert('Error: El torneo no tiene un ID válido');
      return;
    }
    
    this.deletingTournamentId.set(tournament.id);
    
    try {
      await this.firebaseService.deleteTournament(tournament.id);
      this.loadTournaments();
      alert('Torneo eliminado exitosamente');
    } catch (error) {
      console.error('Error deleting tournament:', error);
      alert('Error al eliminar el torneo. Por favor intenta nuevamente.');
    } finally {
      this.deletingTournamentId.set(null);
    }
  }
}

