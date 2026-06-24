import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FirebaseService, Tournament, UserProfile, Team, BracketMatch, PlayerInfo } from '../../services/firebase.service';
import { Timestamp } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { BracketCanvasComponent } from '../../components/bracket-canvas/bracket-canvas.component';
import {
  parseRegistrationRows,
  readSpreadsheetFile,
  type RegistrationImportResult
} from '../../utils/tournament-registration-import';

@Component({
  selector: 'app-tournaments',
  standalone: true,
  imports: [CommonModule, FormsModule, BracketCanvasComponent, RouterLink],
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
  
  // Register team modal - Step 1: Create team
  showRegisterModal = signal(false);
  showPlayersStep = signal(false); // Paso 2: Llenar información de jugadores
  registering = signal(false);
  selectedTournament = signal<Tournament | null>(null);
  teamName = signal('');
  teamLogo = signal<File | null>(null);
  teamLogoPreview = signal<string | null>(null);
  uploadingLogo = signal(false);
  
  // Register team modal - Step 2: Players info
  playersInfo = signal<PlayerInfo[]>([]);
  currentPlayerIndex = signal(0); // Índice de la carta actual
  editingPlayerIndex = signal<number | null>(null); // Índice del jugador en edición
  maxPlayers = 5; // Para LoL
  
  roles = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];
  
  // Delete tournament
  deletingTournamentId = signal<string | null>(null);

  /** Modal torneo de prueba: siempre 16 equipos ficticios */
  showPracticeModal = signal(false);

  /** Borrador de equipos importados desde Excel/CSV (solo al crear torneo, no al editar) */
  registrationImportDraft = signal<RegistrationImportResult | null>(null);
  
  // Bracket view
  selectedTournamentForBracket = signal<Tournament | null>(null);
  showBracket = signal(false);
  organizingBracket = signal(false); // Si está en modo organización
  bracketTeams = signal<Team[]>([]); // Equipos organizados para el bracket
  draggedTeam: Team | null = null;
  bracketSlots: Array<{ team: Team | null; position: number }> = [];
  bracketMatches: Array<{ team1: Team | null; team2: Team | null; matchIndex: number }> = [];
  /** true = vista canvas tipo bracket, false = vista lista de enfrentamientos */
  bracketViewCanvas = signal(true);
  
  // Form fields
  tournamentName = signal('');
  tournamentDescription = signal('');
  tournamentGame = signal('League of Legends');
  tournamentStartDate = signal('');
  tournamentEndDate = signal('');
  tournamentMaxTeams = signal(16);
  tournamentConfiguredRounds = signal(4);
  tournamentFormat = signal<'single' | 'double'>('double');

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

  teamCounts = [2, 4, 8, 16, 32, 64]; // Incluir 2 para versus
  roundOptions = [1, 2, 3, 4];

  ngOnInit() {
    this.loadTournaments();
    // Suscribirse a cambios de auth: cuando llegue el usuario, comprobar admin (evita que getCurrentUser() sea null al cargar)
    this.subscriptions.add(
      this.firebaseService.currentUser.subscribe((user) => {
        if (user) {
          this.checkAdminStatus();
        } else {
          this.isAdmin.set(false);
          this.currentUser.set(null);
        }
      })
    );
    // Comprobar ya por si auth estaba listo al montar
    this.checkAdminStatus();
    // Verificar queryParams después de un tick por si checkAdminStatus es async
    setTimeout(() => {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('create') === 'true' && this.isAdmin()) {
        this.openCreateModal();
        window.history.replaceState({}, '', window.location.pathname);
      }
    }, 300);
  }

  async checkAdminStatus() {
    const user = this.firebaseService.getCurrentUser();
    if (!user) return;
    try {
      const profile = await this.firebaseService.getUserProfile(user.uid);
      this.currentUser.set(profile);
      const admin = await this.firebaseService.isAdmin(user.uid);
      this.isAdmin.set(admin);
    } catch {
      this.isAdmin.set(false);
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
    this.tournamentConfiguredRounds.set(4);
    this.tournamentFormat.set('double');
    this.registrationImportDraft.set(null);
  }

  private getCurrentDateTimeLocal(): Date {
    const now = new Date();
    now.setSeconds(0, 0);
    return now;
  }

  private formatDateTimeLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  getMinStartDateTime(): string {
    return this.formatDateTimeLocal(this.getCurrentDateTimeLocal());
  }

  getMinEndDateTime(): string {
    const selectedStart = this.tournamentStartDate();
    if (selectedStart) {
      return selectedStart;
    }
    return this.getMinStartDateTime();
  }

  getBracketCapacityForRounds(rounds: number): number {
    return Math.pow(2, Math.max(1, rounds));
  }

  /**
   * Cupos del cuadro en el organizador: al menos lo que marcan las rondas del torneo,
   * pero nunca menos que una potencia de 2 que cubra a todos los equipos ya registrados
   * (si hay 16 equipos y las rondas decían 8 cupos, el cuadro pasa a 16).
   */
  getOrganizerBracketPower(tournament: Tournament | null | undefined): number {
    if (!tournament) return 16;
    const fromRounds = this.getBracketCapacityForRounds(this.getTournamentConfiguredRounds(tournament));
    const n = (tournament.teams || []).length;
    if (n <= 0) return Math.min(64, fromRounds);
    const needed = Math.pow(2, Math.ceil(Math.log2(Math.max(2, n))));
    return Math.min(64, Math.max(fromRounds, needed));
  }

  getAvailableTeamCounts(): number[] {
    const capacity = this.getBracketCapacityForRounds(this.tournamentConfiguredRounds());
    return this.teamCounts.filter(count => count <= capacity);
  }

  onConfiguredRoundsChange(rounds: number | string) {
    const n = typeof rounds === 'string' ? parseInt(rounds, 10) : rounds;
    if (Number.isNaN(n)) return;
    this.tournamentConfiguredRounds.set(n);
    const availableCounts = this.getAvailableTeamCounts();
    if (!availableCounts.includes(this.tournamentMaxTeams())) {
      this.tournamentMaxTeams.set(availableCounts[availableCounts.length - 1] ?? 2);
    }
  }

  getTournamentConfiguredRounds(tournament: Tournament | null | undefined): number {
    if (!tournament) return this.tournamentConfiguredRounds();
    if (typeof tournament.configuredRounds === 'number' && tournament.configuredRounds > 0) {
      return tournament.configuredRounds;
    }
    const basis = Math.max((tournament.teams || []).length, tournament.maxTeams || 2, 2);
    return Math.min(4, Math.max(1, Math.ceil(Math.log2(basis))));
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

    const bracketCapacity = this.getBracketCapacityForRounds(this.tournamentConfiguredRounds());
    if (this.tournamentMaxTeams() > bracketCapacity) {
      alert(`La cantidad de equipos no puede superar los ${bracketCapacity} cupos para ${this.tournamentConfiguredRounds()} rondas.`);
      return;
    }

    const imp = this.registrationImportDraft();
    if (imp?.teams?.length) {
      if (imp.errors.length) {
        alert(`Importación: ${imp.errors.join(' ')}`);
        return;
      }
      if (imp.teams.length > this.tournamentMaxTeams()) {
        alert(
          `El archivo tiene ${imp.teams.length} equipos y el torneo admite como máximo ${this.tournamentMaxTeams()}. Aumenta el cupo o quita filas del Excel.`
        );
        return;
      }
      if (imp.teams.length > bracketCapacity) {
        alert(`El archivo tiene más equipos (${imp.teams.length}) que el cupo del bracket (${bracketCapacity} con ${this.tournamentConfiguredRounds()} rondas).`);
        return;
      }
    }

    const startDate = new Date(this.tournamentStartDate());
    const endDate = new Date(this.tournamentEndDate());
    const minStartDate = this.getCurrentDateTimeLocal();

    if (startDate < minStartDate) {
      alert('La fecha de inicio debe ser desde la fecha y hora actual en adelante');
      return;
    }

    if (endDate <= startDate) {
      alert('La fecha de finalización debe ser posterior a la fecha de inicio');
      return;
    }

    this.creating.set(true);
    try {
      const tournamentToEdit = this.selectedTournament();
      
      if (tournamentToEdit && tournamentToEdit.id) {
        const newMax = this.tournamentMaxTeams();
        const payload: Record<string, unknown> = {
          name: this.tournamentName(),
          description: this.tournamentDescription(),
          game: this.tournamentGame(),
          startDate: Timestamp.fromDate(startDate),
          endDate: Timestamp.fromDate(endDate),
          maxTeams: newMax,
          format: this.tournamentFormat(),
          configuredRounds: this.tournamentConfiguredRounds()
        };

        if (this.isPracticeTournament(tournamentToEdit)) {
          payload['teams'] = this.syncPracticeTeamsForEdit(tournamentToEdit, newMax);
          if (newMax !== tournamentToEdit.maxTeams) {
            payload['confirmed'] = false;
            payload['bracket'] = [];
            payload['lowerBracket'] = [];
            payload['status'] = 'upcoming';
          }
        }

        await this.firebaseService.updateTournament(tournamentToEdit.id, payload as Partial<Tournament>);

        this.closeModal();
        this.loadTournaments();
        alert(
          this.isPracticeTournament(tournamentToEdit) && newMax !== tournamentToEdit.maxTeams
            ? `Torneo actualizado: ${newMax} equipos ficticios. El bracket anterior se anuló; vuelve a organizarlo si hacía falta.`
            : 'Torneo actualizado exitosamente'
        );
      } else {
        const tournamentId = await this.firebaseService.createTournament({
          name: this.tournamentName(),
          description: this.tournamentDescription(),
          game: this.tournamentGame(),
          startDate: Timestamp.fromDate(startDate),
          endDate: Timestamp.fromDate(endDate),
          maxTeams: this.tournamentMaxTeams(),
          format: this.tournamentFormat(),
          configuredRounds: this.tournamentConfiguredRounds(),
          createdBy: user.uid
        });

        const importRes = this.registrationImportDraft();
        if (importRes?.teams?.length && !importRes.errors.length) {
          const teams: Team[] = importRes.teams.map((draft, index) => ({
            ...draft,
            id: `team-${tournamentId}-${index}`,
            registeredAt: Timestamp.now()
          }));
          await this.firebaseService.updateTournament(tournamentId, {
            teams,
            confirmed: false,
            status: 'upcoming'
          });
          const warn = importRes.warnings.length ? `\n\nAvisos: ${importRes.warnings.slice(0, 5).join(' ')}` : '';
          this.closeModal();
          this.loadTournaments();
          alert(`Torneo creado con ${teams.length} equipo(s) importados desde la hoja.${warn}`);
        } else {
          this.closeModal();
          this.loadTournaments();
          alert('Torneo creado exitosamente');
        }
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

  isUserRegistered(tournament: Tournament): boolean {
    const user = this.firebaseService.getCurrentUser();
    if (!user) return false;
    
    const teams = tournament.teams || [];
    return teams.some(team => {
      // Verificar si es el capitán
      if (team.captainId === user.uid) return true;
      
      // Verificar en players (array de IDs)
      if (team.players && team.players.some((p: string) => p === user.uid || p === user.email)) return true;
      
      // Verificar en playerInfo
      if (team.playerInfo && team.playerInfo.some((p: any) => {
        if (typeof p === 'object' && p.email) {
          return p.email === user.email;
        }
        return false;
      })) return true;
      
      return false;
    });
  }

  openRegisterModal(tournament: Tournament) {
    const user = this.firebaseService.getCurrentUser();
    if (!user) {
      alert('Debes iniciar sesión para registrarte');
      this.router.navigate(['/login']);
      return;
    }
    
    // Verificar si el torneo está lleno
    const teams = tournament.teams || [];
    if (teams.length >= tournament.maxTeams) {
      alert('El torneo está lleno');
      return;
    }
    
    // Verificar si el usuario ya está registrado
    if (this.isUserRegistered(tournament)) {
      alert('Ya estás registrado en este torneo');
      return;
    }
    
    this.selectedTournament.set(tournament);
    this.resetRegisterForm();
    this.showRegisterModal.set(true);
    this.showPlayersStep.set(false);
    this.initPlayersInfo();
  }

  closeRegisterModal() {
    this.showRegisterModal.set(false);
    this.showPlayersStep.set(false);
    this.resetRegisterForm();
    this.selectedTournament.set(null);
  }

  resetRegisterForm() {
    this.teamName.set('');
    this.teamLogo.set(null);
    this.teamLogoPreview.set(null);
    this.playersInfo.set([]);
    this.currentPlayerIndex.set(0);
    this.editingPlayerIndex.set(null);
    this.initPlayersInfo();
  }

  // Lista de campeones de LoL
  champions = [
    'Aatrox', 'Ahri', 'Akali', 'Akshan', 'Alistar', 'Ambessa', 'Amumu', 'Anivia', 'Annie', 'Aphelios', 'Ashe',
    'Aurelion Sol', 'Aurora', 'Azir', 'Bard', 'Bel\'Veth', 'Blitzcrank', 'Brand', 'Braum', 'Caitlyn', 'Camille', 'Cassiopeia',
    'Cho\'Gath', 'Corki', 'Darius', 'Diana', 'Draven', 'Dr. Mundo', 'Ekko', 'Elise', 'Evelynn', 'Ezreal',
    'Fiddlesticks', 'Fiora', 'Fizz', 'Galio', 'Gangplank', 'Garen', 'Gnar', 'Gragas', 'Graves', 'Gwen',
    'Hecarim', 'Heimerdinger', 'Hwei', 'Illaoi', 'Irelia', 'Ivern', 'Janna', 'Jarvan IV', 'Jax', 'Jayce',
    'Jhin', 'Jinx', 'K\'Sante', 'Kai\'Sa', 'Kalista', 'Karma', 'Karthus', 'Kassadin', 'Katarina', 'Kayle',
    'Kayn', 'Kennen', 'Kha\'Zix', 'Kindred', 'Kled', 'Kog\'Maw', 'LeBlanc', 'Lee Sin', 'Leona', 'Lillia',
    'Lissandra', 'Lucian', 'Lulu', 'Lux', 'Malphite', 'Malzahar', 'Maokai', 'Master Yi', 'Mel', 'Milio', 'Miss Fortune',
    'Mordekaiser', 'Morgana', 'Naafiri', 'Nami', 'Nasus', 'Nautilus', 'Neeko', 'Nidalee', 'Nilah', 'Nocturne',
    'Nunu', 'Olaf', 'Orianna', 'Ornn', 'Pantheon', 'Poppy', 'Pyke', 'Qiyana', 'Quinn', 'Rakan',
    'Rammus', 'Rek\'Sai', 'Rell', 'Renata Glasc', 'Renekton', 'Rengar', 'Riven', 'Rumble', 'Ryze', 'Samira',
    'Sejuani', 'Senna', 'Seraphine', 'Sett', 'Shaco', 'Shen', 'Shyvana', 'Singed', 'Sion', 'Sivir',
    'Skarner', 'Smolder', 'Sona', 'Soraka', 'Swain', 'Sylas', 'Syndra', 'Tahm Kench', 'Taliyah', 'Talon', 'Taric',
    'Teemo', 'Thresh', 'Tristana', 'Trundle', 'Tryndamere', 'Twisted Fate', 'Twitch', 'Udyr', 'Urgot', 'Varus',
    'Vayne', 'Veigar', 'Vel\'Koz', 'Vex', 'Vi', 'Viego', 'Viktor', 'Vladimir', 'Volibear', 'Warwick',
    'Wukong', 'Xayah', 'Xerath', 'Xin Zhao', 'Yasuo', 'Yone', 'Yorick', 'Yuumi', 'Yunara', 'Zaahen', 'Zac', 'Zed', 'Zeri',
    'Ziggs', 'Zilean', 'Zoe', 'Zyra'
  ];
  

  initPlayersInfo() {
    // Inicializar array de jugadores con datos vacíos
    const emptyPlayers: PlayerInfo[] = Array(this.maxPlayers).fill(null).map((_, index) => ({
      name: '',
      phone: '',
      email: '',
      gameName: '',
      tagLine: '',
      role: this.roles[index] || '',
      mainChampion: ''
    }));
    this.playersInfo.set(emptyPlayers);
  }

  onLogoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > 5 * 1024 * 1024) { // 5MB max
        alert('La imagen debe ser menor a 5MB');
        return;
      }
      
      this.teamLogo.set(file);
      
      // Crear preview
      const reader = new FileReader();
      reader.onload = (e) => {
        this.teamLogoPreview.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  async uploadTeamLogo(): Promise<string | null> {
    const logo = this.teamLogo();
    if (!logo) return null;

    this.uploadingLogo.set(true);
    try {
      const user = this.firebaseService.getCurrentUser();
      if (!user) return null;

      const timestamp = Date.now();
      const fileName = `teams/${user.uid}/${timestamp}_${logo.name}`;
      const logoUrl = await this.firebaseService.uploadTeamLogo(fileName, logo);
      return logoUrl;
    } catch (error) {
      console.error('Error uploading logo:', error);
      return null;
    } finally {
      this.uploadingLogo.set(false);
    }
  }

  async createTeamAndGoToPlayers() {
    if (!this.teamName().trim()) {
      alert('Por favor ingresa un nombre para tu equipo');
      return;
    }

    // Verificar que el nombre del equipo no esté duplicado en el torneo
    const tournament = this.selectedTournament();
    if (tournament) {
      const teams = tournament.teams || [];
      const nameExists = teams.some(team => 
        team.name.toLowerCase().trim() === this.teamName().toLowerCase().trim()
      );
      
      if (nameExists) {
        alert('Ya existe un equipo con ese nombre en este torneo');
        return;
      }
    }

    // Subir logo si existe
    let logoUrl: string | null = null;
    if (this.teamLogo()) {
      const user = this.firebaseService.getCurrentUser();
      if (user) {
        const timestamp = Date.now();
        const fileName = `teams/${user.uid}/${timestamp}_${this.teamLogo()!.name}`;
        try {
          logoUrl = await this.firebaseService.uploadTeamLogo(fileName, this.teamLogo()!);
        } catch (error) {
          alert('Error al subir el logo. Intenta nuevamente.');
          return;
        }
      }
    }

    // Guardar temporalmente el logo URL
    this.teamLogoPreview.set(logoUrl);
    
    // Ir al paso de jugadores
    this.showPlayersStep.set(true);
  }

  goBackToTeamCreation() {
    this.showPlayersStep.set(false);
  }

  getPlayerCard(index: number): PlayerInfo {
    return this.playersInfo()[index] || {
      name: '',
      phone: '',
      email: '',
      gameName: '',
      tagLine: '',
      role: this.roles[index] || '',
      mainChampion: ''
    };
  }

  updatePlayerInfo(index: number, field: keyof PlayerInfo, value: any) {
    const players = [...this.playersInfo()];
    if (!players[index]) {
      players[index] = {
        name: '',
        phone: '',
        email: '',
        gameName: '',
        tagLine: '',
        role: this.roles[index] || ''
      };
    }
    (players[index] as any)[field] = value;
    this.playersInfo.set(players);
  }

  async validatePlayerUnique(playerInfo: PlayerInfo, currentIndex: number): Promise<{ valid: boolean; message?: string }> {
    const tournament = this.selectedTournament();
    if (!tournament) return { valid: false, message: 'Torneo no encontrado' };

    const teams = tournament.teams || [];
    const currentPlayers = this.playersInfo();

    // Validar que no se repita en otros equipos
    for (const team of teams) {
      if (team.playerInfo) {
        for (const player of team.playerInfo) {
          // Validar email único
          if (player.email && player.email.toLowerCase() === playerInfo.email.toLowerCase() && player.email.trim() !== '') {
            return { valid: false, message: 'Este correo ya está registrado en otro equipo' };
          }
          
          // Validar invocador único (gameName#tagLine)
          if (player.gameName && player.tagLine && 
              player.gameName.toLowerCase() === playerInfo.gameName.toLowerCase() &&
              player.tagLine.toLowerCase() === playerInfo.tagLine.toLowerCase() &&
              playerInfo.gameName.trim() !== '' && playerInfo.tagLine.trim() !== '') {
            return { valid: false, message: `El invocador ${playerInfo.gameName}#${playerInfo.tagLine} ya está registrado en otro equipo` };
          }
        }
      }
    }

    // Validar que no se repita dentro del mismo equipo (excepto el actual)
    for (let i = 0; i < currentPlayers.length; i++) {
      if (i === currentIndex) continue;
      const player = currentPlayers[i];
      
      if (player.email && player.email.toLowerCase() === playerInfo.email.toLowerCase() && playerInfo.email.trim() !== '') {
        return { valid: false, message: 'Este correo ya está usado en otro jugador de tu equipo' };
      }
      
      if (player.gameName && player.tagLine &&
          player.gameName.toLowerCase() === playerInfo.gameName.toLowerCase() &&
          player.tagLine.toLowerCase() === playerInfo.tagLine.toLowerCase() &&
          playerInfo.gameName.trim() !== '' && playerInfo.tagLine.trim() !== '') {
        return { valid: false, message: `El invocador ${playerInfo.gameName}#${playerInfo.tagLine} ya está usado en otro jugador de tu equipo` };
      }
    }

    return { valid: true };
  }

  async savePlayerCard(index: number) {
    const playerInfo = this.playersInfo()[index];
    
    if (!playerInfo.name.trim() || !playerInfo.phone.trim() || !playerInfo.email.trim() || 
        !playerInfo.gameName.trim() || !playerInfo.tagLine.trim()) {
      alert('Por favor completa todos los campos requeridos');
      return;
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(playerInfo.email)) {
      alert('Por favor ingresa un correo electrónico válido');
      return;
    }

    // Validar unicidad
    const validation = await this.validatePlayerUnique(playerInfo, index);
    if (!validation.valid) {
      alert(validation.message);
      return;
    }

    // Guardar la carta (ya está en el signal)
    // Avanzar a la siguiente carta si no es la última
    if (index < this.maxPlayers - 1) {
      this.currentPlayerIndex.set(index + 1);
    } else {
      // Si es la última, verificar que todas estén completas
      const allComplete = this.playersInfo().every(p => 
        p.name.trim() && p.phone.trim() && p.email.trim() && 
        p.gameName.trim() && p.tagLine.trim()
      );
      
      if (!allComplete) {
        alert('Por favor completa todas las cartas de jugadores antes de continuar');
        return;
      }
    }

    this.editingPlayerIndex.set(null);
  }

  editPlayerCard(index: number) {
    this.editingPlayerIndex.set(index);
    this.currentPlayerIndex.set(index);
    // Asegurar que el jugador existe en el array
    if (!this.playersInfo()[index]) {
      this.playersInfo.set([...this.playersInfo(), this.getPlayerCard(index)]);
    }
  }

  isCardComplete(index: number): boolean {
    const player = this.playersInfo()[index];
    if (!player) return false;
    return !!(player.name.trim() && player.phone.trim() && player.email.trim() && 
              player.gameName.trim() && player.tagLine.trim());
  }

  canProceedToNextCard(index: number): boolean {
    return this.isCardComplete(index);
  }

  allCardsComplete(): boolean {
    if (this.playersInfo().length < this.maxPlayers) {
      return false;
    }
    for (let i = 0; i < this.maxPlayers; i++) {
      if (!this.isCardComplete(i)) {
        return false;
      }
    }
    return true;
  }

  async finalizeTeamRegistration() {
    const user = this.firebaseService.getCurrentUser();
    const tournament = this.selectedTournament();

    if (!user || !tournament || !this.currentUser()) return;

    if (!this.allCardsComplete()) {
      alert(`Necesitas completar la información de los ${this.maxPlayers} jugadores.`);
      return;
    }

    this.registering.set(true);
    try {
      const team: Team = {
        id: `team-${Date.now()}`,
        name: this.teamName(),
        captainId: user.uid,
        captainName: this.currentUser()!.displayName,
        players: this.playersInfo().map(p => p.email), // Using email as a unique identifier for now
        playerInfo: this.playersInfo(), // Store detailed player info
        substitutes: [],
        logoUrl: this.teamLogoPreview() || undefined, // Add logo URL
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
          teams.every(t => {
            if (t.playerInfo && t.playerInfo.length > 0) {
              return t.playerInfo.length >= this.maxPlayers && t.playerInfo.every(p => p.name.trim() && p.email.trim() && p.gameName.trim() && p.tagLine.trim());
            }
            return t.players && t.players.length >= this.maxPlayers;
          });

        // Generar bracket automáticamente cuando todos los equipos estén completos
        if (allTeamsComplete && !updatedTournament.confirmed && !updatedTournament.bracket) {
          const bracket = this.firebaseService.generateBracket(
            updatedTournament.teams,
            this.getTournamentConfiguredRounds(updatedTournament)
          );
          await this.firebaseService.updateTournament(tournament.id!, {
            bracket: this.sanitizeBracketForFirestore(bracket)
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
    // Siempre abrir el canvas organizador del bracket
    this.selectedTournamentForBracket.set(tournament);
    this.showBracket.set(true);
    this.organizingBracket.set(true);
    
    // Inicializar los slots del bracket
    this.initializeBracketSlots();
    
    // Si hay un bracket confirmado, cargar los equipos en los slots
    if (tournament.confirmed && tournament.teams) {
      this.loadTeamsIntoSlots(tournament.teams);
    }
  }

  openBracketOrganizer(tournament: Tournament) {
    // Solo el admin puede organizar el bracket antes del inicio
    if (!this.isAdmin()) return;
    
    this.selectedTournamentForBracket.set(tournament);
    this.organizingBracket.set(true);
    this.showBracket.set(true);
    
    // Inicializar los slots del bracket
    this.initializeBracketSlots();
    
    // Si hay un bracket confirmado, cargar los equipos en los slots
    if (tournament.confirmed && tournament.teams) {
      this.loadTeamsIntoSlots(tournament.teams);
    }
  }

  loadTeamsIntoSlots(teams: Team[]) {
    const tournament = this.selectedTournamentForBracket();
    const power = tournament ? this.getOrganizerBracketPower(tournament) : 16;
    const expectedMatches = power / 2;

    // Cargar equipos en los slots basándose en su orden en el array
    teams.forEach((team, index) => {
      if (index < this.bracketSlots.length) {
        this.bracketSlots[index].team = team;
      }
    });
    
    // Cargar equipos en enfrentamientos (parejas)
    for (let i = 0; i < expectedMatches; i++) {
      if (i < this.bracketMatches.length) {
        this.bracketMatches[i].team1 = teams[i * 2] || null;
        this.bracketMatches[i].team2 = teams[i * 2 + 1] || null;
      }
    }
    
    this.updateBracketTeams();
  }

  initializeBracketSlots() {
    const tournament = this.selectedTournamentForBracket();
    if (!tournament) return;
    
    // Obtener cantidad real de equipos registrados
    const registeredTeams = tournament.teams || [];
    const numRegisteredTeams = registeredTeams.length;
    
    // Si el bracket ya está confirmado, usar los equipos del bracket confirmado
    if (tournament.confirmed && tournament.teams && tournament.teams.length > 0) {
      const confirmedTeams = tournament.teams;
      const power = this.getOrganizerBracketPower(tournament);
      const numMatches = power / 2;
      this.bracketMatches = Array(numMatches).fill(null).map((_, i) => ({
        team1: confirmedTeams[i * 2] || null,
        team2: confirmedTeams[i * 2 + 1] || null,
        matchIndex: i
      }));
      this.bracketSlots = Array(numMatches * 2).fill(null).map((_, i) => ({
        team: confirmedTeams[i] || null,
        position: i
      }));
      return;
    }

    const power = this.getOrganizerBracketPower(tournament);
    const numMatches = power / 2;

    this.bracketSlots = Array(power).fill(null).map((_, i) => ({
      team: null,
      position: i
    }));

    this.bracketMatches = Array(numMatches).fill(null).map((_, i) => ({
      team1: null,
      team2: null,
      matchIndex: i
    }));
  }

  // Obtener equipos disponibles (que NO están en enfrentamientos)
  getAvailableTeams(): Team[] {
    const tournament = this.selectedTournamentForBracket();
    if (!tournament || !tournament.teams) return [];
    
    // Obtener IDs de equipos que están en enfrentamientos
    const teamsInMatches = new Set<string>();
    this.bracketMatches.forEach(match => {
      if (match.team1) teamsInMatches.add(match.team1.id);
      if (match.team2) teamsInMatches.add(match.team2.id);
    });
    
    // Filtrar equipos que NO están en enfrentamientos
    return tournament.teams.filter(team => !teamsInMatches.has(team.id));
  }

  getBracketSlots(): Array<{ team: Team | null; position: number }> {
    return this.bracketSlots;
  }

  getBracketMatches(): Array<{ team1: Team | null; team2: Team | null; matchIndex: number }> {
    return this.bracketMatches;
  }

  onTeamDragStart(event: DragEvent, team: Team) {
    this.draggedTeam = team;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', team.id);
    }
  }

  onTeamDragEnd(event: DragEvent) {
    this.draggedTeam = null;
  }

  onBracketDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onBracketDrop(event: DragEvent) {
    event.preventDefault();
  }

  onSlotDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onSlotDrop(event: DragEvent, slotIndex: number) {
    event.preventDefault();
    event.stopPropagation();
    
    if (!this.draggedTeam) return;
    
    // Verificar si el equipo ya está en otro slot
    const existingSlotIndex = this.bracketSlots.findIndex(slot => slot.team?.id === this.draggedTeam!.id);
    
    if (existingSlotIndex !== -1 && existingSlotIndex !== slotIndex) {
      // Intercambiar equipos si hay un equipo en el slot destino
      if (this.bracketSlots[slotIndex].team) {
        this.bracketSlots[existingSlotIndex].team = this.bracketSlots[slotIndex].team;
      } else {
        this.bracketSlots[existingSlotIndex].team = null;
      }
    }
    
    this.bracketSlots[slotIndex].team = this.draggedTeam;
    this.updateBracketTeams();
  }

  removeTeamFromSlot(slotIndex: number) {
    this.bracketSlots[slotIndex].team = null;
    this.updateBracketTeams();
  }

  removeTeamFromBracket(teamIndex: number) {
    const tournament = this.selectedTournamentForBracket();
    if (!tournament) return;
    
    const removedTeam = tournament.teams?.[teamIndex];
    if (removedTeam) {
      const slotIndex = this.bracketSlots.findIndex(slot => slot.team?.id === removedTeam.id);
      if (slotIndex !== -1) {
        this.bracketSlots[slotIndex].team = null;
      }
    }
    
    this.updateBracketTeams();
  }

  updateBracketTeams() {
    const teams = this.bracketSlots
      .filter(slot => slot.team !== null)
      .map(slot => slot.team!);
    this.bracketTeams.set(teams);
  }

  allSlotsFilled(): boolean {
    const tournament = this.selectedTournamentForBracket();
    const requiredTeams = tournament?.teams || [];
    if (requiredTeams.length < 2) return false;

    const assignedIds = this.bracketMatches.flatMap(match => [
      match.team1?.id,
      match.team2?.id
    ]).filter((id): id is string => !!id);

    const uniqueAssigned = new Set(assignedIds);
    return uniqueAssigned.size === requiredTeams.length;
  }

  /** Genera el bracket automáticamente: orden aleatorio de equipos en los enfrentamientos */
  autoGenerateBracket() {
    const tournament = this.selectedTournamentForBracket();
    if (!tournament || !tournament.teams || tournament.teams.length < 2) {
      alert('Se necesitan al menos 2 equipos registrados para generar el bracket');
      return;
    }
    const teams = [...tournament.teams].sort(() => Math.random() - 0.5);
    const numMatches = Math.floor(teams.length / 2);
    for (let i = 0; i < numMatches && i < this.bracketMatches.length; i++) {
      this.bracketMatches[i].team1 = teams[i * 2] || null;
      this.bracketMatches[i].team2 = teams[i * 2 + 1] || null;
    }
    for (let i = numMatches; i < this.bracketMatches.length; i++) {
      this.bracketMatches[i].team1 = null;
      this.bracketMatches[i].team2 = null;
    }
    this.syncMatchesToSlots();
  }

  // Manejar drop en enfrentamientos (parejas)
  onMatchTeamDrop(event: DragEvent, matchIndex: number, teamPosition: 'team1' | 'team2') {
    event.preventDefault();
    event.stopPropagation();
    
    if (!this.draggedTeam) return;
    
    // Buscar si el equipo ya está en otro enfrentamiento y removerlo
    for (let i = 0; i < this.bracketMatches.length; i++) {
      if (this.bracketMatches[i].team1?.id === this.draggedTeam.id) {
        if (i !== matchIndex || teamPosition !== 'team1') {
          this.bracketMatches[i].team1 = null;
        }
      }
      if (this.bracketMatches[i].team2?.id === this.draggedTeam.id) {
        if (i !== matchIndex || teamPosition !== 'team2') {
          this.bracketMatches[i].team2 = null;
        }
      }
    }
    
    // Si hay un equipo en la posición destino, intercambiar
    const currentTeam = this.bracketMatches[matchIndex][teamPosition];
    if (currentTeam && currentTeam.id !== this.draggedTeam.id) {
      // Buscar un slot vacío para el equipo desplazado
      for (let i = 0; i < this.bracketMatches.length; i++) {
        if (i !== matchIndex) {
          if (teamPosition === 'team1' && !this.bracketMatches[i].team1) {
            this.bracketMatches[i].team1 = currentTeam;
            break;
          } else if (teamPosition === 'team2' && !this.bracketMatches[i].team2) {
            this.bracketMatches[i].team2 = currentTeam;
            break;
          }
        }
      }
    }
    
    // Colocar el equipo en la posición
    this.bracketMatches[matchIndex][teamPosition] = this.draggedTeam;
    this.syncMatchesToSlots();
  }

  removeTeamFromMatch(matchIndex: number, teamPosition: 'team1' | 'team2') {
    this.bracketMatches[matchIndex][teamPosition] = null;
    this.syncMatchesToSlots();
  }

  /** Cuando se suelta un equipo en un slot del canvas del bracket */
  onCanvasSlotDrop(payload: { matchIndex: number; slot: 'team1' | 'team2' }) {
    if (!this.draggedTeam) return;
    const { matchIndex, slot } = payload;
    if (matchIndex >= 0 && matchIndex < this.bracketMatches.length) {
      for (let i = 0; i < this.bracketMatches.length; i++) {
        if (this.bracketMatches[i].team1?.id === this.draggedTeam!.id) this.bracketMatches[i].team1 = null;
        if (this.bracketMatches[i].team2?.id === this.draggedTeam!.id) this.bracketMatches[i].team2 = null;
      }
      this.bracketMatches[matchIndex][slot] = this.draggedTeam;
      this.syncMatchesToSlots();
    }
    this.draggedTeam = null;
  }

  onCanvasSlotRemove(payload: { matchIndex: number; slot: 'team1' | 'team2' }) {
    this.removeTeamFromMatch(payload.matchIndex, payload.slot);
  }

  /** Número de equipos para el layout del canvas (potencia de 2) */
  getCanvasNumTeams(): number {
    const t = this.selectedTournamentForBracket();
    if (!t) return 16;
    return this.getOrganizerBracketPower(t);
  }

  // Sincronizar enfrentamientos con slots para compatibilidad
  syncMatchesToSlots() {
    let slotIndex = 0;
    this.bracketMatches.forEach(match => {
      if (match.team1 && slotIndex < this.bracketSlots.length) {
        this.bracketSlots[slotIndex].team = match.team1;
        slotIndex++;
      }
      if (match.team2 && slotIndex < this.bracketSlots.length) {
        this.bracketSlots[slotIndex].team = match.team2;
        slotIndex++;
      }
    });
    // Limpiar slots restantes
    for (let i = slotIndex; i < this.bracketSlots.length; i++) {
      this.bracketSlots[i].team = null;
    }
    this.updateBracketTeams();
  }

  private sanitizeBracketForFirestore(bracket: BracketMatch[]): any[] {
    return bracket.map(match => ({
      id: match.id,
      round: match.round,
      roundIndex: match.roundIndex ?? null,
      roundLabel: match.roundLabel ?? null,
      slotIndex: match.slotIndex ?? null,
      team1Id: match.team1Id ?? null,
      team1Name: match.team1Name ?? null,
      team2Id: match.team2Id ?? null,
      team2Name: match.team2Name ?? null,
      score1: match.score1 ?? 0,
      score2: match.score2 ?? 0,
      bestOf: match.bestOf ?? 1,
      winnerId: match.winnerId ?? null,
      loserId: match.loserId ?? null,
      loserGoesToMatchId: match.loserGoesToMatchId ?? null,
      loserGoesToMatchSlot: match.loserGoesToMatchSlot ?? null,
      nextMatchId: match.nextMatchId ?? null,
      nextMatchSlot: match.nextMatchSlot ?? null,
      team1SourceMatchId: match.team1SourceMatchId ?? null,
      team2SourceMatchId: match.team2SourceMatchId ?? null,
      autoAdvance: !!match.autoAdvance,
      matchDate: match.matchDate ?? null,
      bracketType: match.bracketType ?? 'upper'
    }));
  }

  closeBracket() {
    this.showBracket.set(false);
    this.selectedTournamentForBracket.set(null);
    this.organizingBracket.set(false);
    this.bracketTeams.set([]);
  }

  async confirmBracket() {
    const tournament = this.selectedTournamentForBracket();
    if (!tournament || !this.isAdmin()) {
      alert('Solo los administradores pueden confirmar el bracket');
      return;
    }
    
    const assignedTeams = this.bracketMatches.flatMap(match => [match.team1, match.team2]).filter((team): team is Team => !!team);
    const uniqueAssignedTeams = new Map(assignedTeams.map(team => [team.id, team]));
    const registeredTeamCount = (tournament.teams || []).length;

    if (uniqueAssignedTeams.size !== registeredTeamCount) {
      alert('Debes ubicar todos los equipos registrados dentro de la llave antes de confirmarla.');
      return;
    }
    
    // Obtener equipos desde los enfrentamientos, en orden de los enfrentamientos
    const teams: Team[] = [];
    this.bracketMatches.forEach(match => {
      if (match.team1 && !teams.some(team => team.id === match.team1!.id)) teams.push(match.team1);
      if (match.team2 && !teams.some(team => team.id === match.team2!.id)) teams.push(match.team2);
    });
    
    // Validar que haya al menos 2 equipos (versus mínimo)
    if (teams.length < 2) {
      alert('Necesitas al menos 2 equipos para crear un bracket');
      return;
    }
    
    // Validar que no haya más equipos de los permitidos
    if (teams.length > tournament.maxTeams) {
      alert(`No puedes tener más de ${tournament.maxTeams} equipos en el bracket`);
      return;
    }
    
    try {
      // Generar bracket con el orden de los equipos (en parejas)
      const generated = this.firebaseService.generateTournamentBrackets(
        teams,
        this.getTournamentConfiguredRounds(tournament),
        tournament.format || 'single'
      );
      
      // Actualizar el torneo en Firebase
      await this.firebaseService.updateTournament(tournament.id!, {
        confirmed: true,
        confirmedAt: Timestamp.now(),
        bracket: this.sanitizeBracketForFirestore(generated.bracket),
        lowerBracket: this.sanitizeBracketForFirestore(generated.lowerBracket),
        teams: teams
      });
      
      // Recargar la lista de torneos
      this.loadTournaments();
      
      // Actualizar directamente el torneo seleccionado con los nuevos datos
      const updatedTournament: Tournament = {
        ...tournament,
        confirmed: true,
        confirmedAt: Timestamp.now(),
        bracket: generated.bracket,
        lowerBracket: generated.lowerBracket,
        teams: teams
      };
      
      this.selectedTournamentForBracket.set(updatedTournament);
      
      // Cambiar a vista del bracket visual (no organizar)
      this.organizingBracket.set(false);

      if (tournament.id) {
        this.router.navigate(['/tournaments', tournament.id, 'vista-interactiva']);
      } else {
        alert('Bracket confirmado exitosamente.');
      }
    } catch (error) {
      console.error('Error al confirmar bracket:', error);
      alert('Error al confirmar el bracket. Por favor intenta nuevamente.');
    }
  }

  async startTournament(tournament: Tournament) {
    if (!confirm('¿Estás seguro de iniciar este torneo? Esto generará el bracket final.')) {
      return;
    }
    
    try {
      await this.firebaseService.updateTournament(tournament.id!, {
        status: 'ongoing',
        bracket: this.sanitizeBracketForFirestore(tournament.bracket || []),
        lowerBracket: this.sanitizeBracketForFirestore(tournament.lowerBracket || [])
      });
      this.loadTournaments();
      alert('Torneo iniciado exitosamente');
    } catch (error) {
      console.error('Error starting tournament:', error);
      alert('Error al iniciar el torneo');
    }
  }

  /** Selecciona manualmente el ganador y lo avanza a la siguiente ronda */
  async updateMatchWinner(matchId: string, winnerId: string) {
    const tournament = this.selectedTournamentForBracket();
    if (!tournament) return;

    const currentMatch = tournament.bracket?.find(m => m.id === matchId) || tournament.lowerBracket?.find(m => m.id === matchId);
    if (!currentMatch || !winnerId) return;
    if (!this.canAdvanceTeam(currentMatch, winnerId)) {
      return;
    }
    const winnerName = winnerId === currentMatch.team1Id ? currentMatch.team1Name : currentMatch.team2Name;
    const loserId = winnerId === currentMatch.team1Id ? currentMatch.team2Id : currentMatch.team1Id;
    const score1 = winnerId === currentMatch.team1Id ? 1 : 0;
    const score2 = winnerId === currentMatch.team2Id ? 1 : 0;

    let updatedBracket = (tournament.bracket || []).map(match => ({ ...match }));
    let updatedLowerBracket = (tournament.lowerBracket || []).map(match => ({ ...match }));
    const isLowerMatch = updatedLowerBracket.some(match => match.id === matchId);

    const cleared = this.clearDependentMatches(updatedBracket, updatedLowerBracket, currentMatch.id);
    updatedBracket = cleared.bracket;
    updatedLowerBracket = cleared.lowerBracket;

    const targetList = isLowerMatch ? updatedLowerBracket : updatedBracket;
    const currentMatchIndex = targetList.findIndex(match => match.id === matchId);
    if (currentMatchIndex === -1) return;
    targetList[currentMatchIndex] = {
      ...targetList[currentMatchIndex],
      winnerId,
      loserId,
      score1,
      score2
    };
    if (isLowerMatch) {
      updatedLowerBracket = targetList;
    } else {
      updatedBracket = targetList;
    }

    const propagated = this.propagateWinner(updatedBracket, updatedLowerBracket, currentMatch, winnerId, winnerName ?? 'TBD', loserId);
    updatedBracket = propagated.bracket;
    updatedLowerBracket = propagated.lowerBracket;

    try {
      await this.firebaseService.updateTournament(tournament.id!, {
        bracket: this.sanitizeBracketForFirestore(updatedBracket),
        lowerBracket: this.sanitizeBracketForFirestore(updatedLowerBracket)
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

  private clearDependentMatches(
    bracket: BracketMatch[],
    lowerBracket: BracketMatch[],
    sourceMatchId: string
  ): { bracket: BracketMatch[]; lowerBracket: BracketMatch[] } {
    let updatedUpper = bracket.map(match => ({ ...match }));
    let updatedLower = lowerBracket.map(match => ({ ...match }));
    const combined = [...updatedUpper, ...updatedLower];
    const dependents = combined.filter(
      match => match.team1SourceMatchId === sourceMatchId || match.team2SourceMatchId === sourceMatchId
    );

    for (const dependent of dependents) {
      const collection = updatedUpper.some(match => match.id === dependent.id) ? updatedUpper : updatedLower;
      const index = collection.findIndex(match => match.id === dependent.id);
      if (index === -1) continue;
      const cleared = { ...collection[index], winnerId: undefined, loserId: undefined, score1: 0, score2: 0 };
      if (cleared.team1SourceMatchId === sourceMatchId) {
        cleared.team1Id = undefined;
        cleared.team1Name = 'TBD';
      }
      if (cleared.team2SourceMatchId === sourceMatchId) {
        cleared.team2Id = undefined;
        cleared.team2Name = 'TBD';
      }
      collection[index] = cleared;
      const next = this.clearDependentMatches(updatedUpper, updatedLower, cleared.id);
      updatedUpper = next.bracket;
      updatedLower = next.lowerBracket;
    }

    return { bracket: updatedUpper, lowerBracket: updatedLower };
  }

  private propagateWinner(
    bracket: BracketMatch[],
    lowerBracket: BracketMatch[],
    currentMatch: BracketMatch,
    winnerId: string,
    winnerName: string,
    loserId?: string
  ): { bracket: BracketMatch[]; lowerBracket: BracketMatch[] } {
    let updatedUpper = [...bracket];
    let updatedLower = [...lowerBracket];

    if (loserId && currentMatch.loserGoesToMatchId && currentMatch.loserGoesToMatchSlot) {
      const loserName = loserId === currentMatch.team1Id ? currentMatch.team1Name : currentMatch.team2Name;
      const loserTargetIndex = updatedLower.findIndex(match => match.id === currentMatch.loserGoesToMatchId);
      if (loserTargetIndex !== -1) {
        const loserTarget = { ...updatedLower[loserTargetIndex] };
        if (currentMatch.loserGoesToMatchSlot === 'team1') {
          loserTarget.team1Id = loserId;
          loserTarget.team1Name = loserName ?? 'TBD';
        } else {
          loserTarget.team2Id = loserId;
          loserTarget.team2Name = loserName ?? 'TBD';
        }
        updatedLower[loserTargetIndex] = loserTarget;
      }
    }

    if (!currentMatch?.nextMatchId || !currentMatch.nextMatchSlot) {
      return { bracket: updatedUpper, lowerBracket: updatedLower };
    }

    const upperNextIndex = updatedUpper.findIndex(match => match.id === currentMatch.nextMatchId);
    const lowerNextIndex = updatedLower.findIndex(match => match.id === currentMatch.nextMatchId);
    const nextIsUpper = upperNextIndex !== -1;
    const nextIndex = nextIsUpper ? upperNextIndex : lowerNextIndex;
    if (nextIndex === -1) return { bracket: updatedUpper, lowerBracket: updatedLower };

    const targetCollection = nextIsUpper ? updatedUpper : updatedLower;
    const nextMatch = { ...targetCollection[nextIndex] };

    if (currentMatch.nextMatchSlot === 'team1') {
      nextMatch.team1Id = winnerId;
      nextMatch.team1Name = winnerName;
    } else {
      nextMatch.team2Id = winnerId;
      nextMatch.team2Name = winnerName;
    }

    nextMatch.winnerId = undefined;
    nextMatch.loserId = undefined;
    nextMatch.score1 = 0;
    nextMatch.score2 = 0;
    targetCollection[nextIndex] = nextMatch;

    const hasTeam1 = !!nextMatch.team1Id;
    const hasTeam2 = !!nextMatch.team2Id;
    if (hasTeam1 !== hasTeam2) {
      const autoWinnerId = nextMatch.team1Id ?? nextMatch.team2Id;
      const autoWinnerName = nextMatch.team1Id ? nextMatch.team1Name : nextMatch.team2Name;
      if (autoWinnerId && autoWinnerName) {
        nextMatch.winnerId = autoWinnerId;
        nextMatch.score1 = nextMatch.team1Id ? 1 : 0;
        nextMatch.score2 = nextMatch.team2Id ? 1 : 0;
        targetCollection[nextIndex] = nextMatch;
        return this.propagateWinner(updatedUpper, updatedLower, nextMatch, autoWinnerId, autoWinnerName);
      }
    }

    return { bracket: updatedUpper, lowerBracket: updatedLower };
  }

  canAdvanceTeam(match: BracketMatch, teamId?: string): boolean {
    if (!teamId) return false;
    if (match.team1Name === 'BYE' || match.team2Name === 'BYE') return false;
    return teamId === match.team1Id || teamId === match.team2Id;
  }

  getWinnerName(match: BracketMatch): string {
    if (match.winnerId === match.team1Id) return match.team1Name || 'TBD';
    if (match.winnerId === match.team2Id) return match.team2Name || 'TBD';
    return 'Pendiente';
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
      case 'lower':
        return 'Recuperación';
      case 'lowerFinal':
        return 'Final Recuperación';
      default:
        if (round.startsWith('lower-')) {
          return `Redención ${round.split('-')[1] || ''}`.trim();
        }
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
    if (!tournament) return [];
    if (round.startsWith('lower')) {
      return (tournament.lowerBracket || []).filter(m => m.round === round);
    }
    return (tournament.bracket || []).filter(m => m.round === round);
  }

  getBracketRounds(): string[] {
    const tournament = this.selectedTournamentForBracket();
    if (!tournament || !tournament.bracket) return [];
    const upperRounds = [...new Set((tournament.bracket || []).sort((a, b) => (a.roundIndex ?? 0) - (b.roundIndex ?? 0)).map(m => m.round))];
    const lowerRounds = [...new Set((tournament.lowerBracket || []).sort((a, b) => (a.roundIndex ?? 0) - (b.roundIndex ?? 0)).map(m => m.round))];
    if (!lowerRounds.length) {
      return upperRounds;
    }

    const finalRound = upperRounds[upperRounds.length - 1];
    const upperWithoutFinal = upperRounds.slice(0, -1);
    return [...upperWithoutFinal, ...lowerRounds, finalRound];
  }

  getRoundDisplayName(round: string): string {
    return this.getRoundName(round);
  }

  // Obtener URL de imagen del campeón desde Data Dragon
  getChampionImageUrl(championName: string): string {
    if (!championName) return '';
    
    // Normalizar el nombre del campeón para que coincida con el formato de Data Dragon
    const normalizedName = this.normalizeChampionName(championName);
    return `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/${normalizedName}.png`;
  }

  // Manejar error al cargar imagen del campeón
  onChampionImageError(event: any) {
    const img = event.target;
    // Intentar con el nombre original si falló con el normalizado
    const originalName = img.alt;
    if (originalName && originalName !== img.src.split('/').pop()?.replace('.png', '')) {
      // Ya intentamos con el normalizado, usar placeholder
      img.src = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/29.png';
    }
  }

  // Normalizar nombre del campeón para Data Dragon
  private normalizeChampionName(championName: string): string {
    if (!championName) return '';

    // Mapeo de nombres que tienen variaciones en Data Dragon
    const championNameMap: { [key: string]: string } = {
      'Dr. Mundo': 'DrMundo',
      'Jarvan IV': 'JarvanIV',
      'K\'Sante': 'KSante',
      'Lee Sin': 'LeeSin',
      'Master Yi': 'MasterYi',
      'Miss Fortune': 'MissFortune',
      'Nunu': 'Nunu',
      'Nunu & Willump': 'Nunu',
      'Renata Glasc': 'RenataGlasc',
      'Tahm Kench': 'TahmKench',
      'Twisted Fate': 'TwistedFate',
      'Xin Zhao': 'XinZhao',
      'Aurelion Sol': 'AurelionSol',
      'Cho\'Gath': 'Chogath',
      'Kai\'Sa': 'Kaisa',
      'Kha\'Zix': 'Khazix',
      'Kog\'Maw': 'KogMaw',
      'Rek\'Sai': 'RekSai',
      'Vel\'Koz': 'Velkoz',
      'Bel\'Veth': 'Belveth',
      'Wukong': 'MonkeyKing',
      // Nuevos campeones - intentar nombres exactos primero
      'Ambessa': 'Ambessa',
      'Aurora': 'Aurora',
      'Mel': 'Mel',
      'Smolder': 'Smolder',
      'Yunara': 'Yunara',
      'Zaahen': 'Zaahen'
    };

    // Si hay un mapeo específico, usarlo
    if (championNameMap[championName]) {
      return championNameMap[championName];
    }

    // Si no, normalizar el nombre
    // Primero, remover espacios, apostrofes y caracteres especiales
    let normalized = championName.trim()
      .replace(/\s+/g, '')
      .replace(/'/g, '')
      .replace(/\./g, '')
      .replace(/&/g, '')
      .replace(/-/g, '')
      .replace(/\(/g, '')
      .replace(/\)/g, '');

    // Si el nombre ya está en formato correcto (primera mayúscula), mantenerlo
    // Caso especial: nombres completamente en mayúsculas o minúsculas
    if (normalized && normalized !== normalized.toUpperCase() && normalized !== normalized.toLowerCase()) {
      // Ya tiene mayúsculas y minúsculas, mantener formato
      normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    } else if (normalized) {
      // Todo mayúsculas o minúsculas, normalizar a primera mayúscula
      normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
    }

    return normalized;
  }

  openPracticeModal() {
    if (!this.isAdmin()) {
      alert('Solo los administradores pueden crear torneos');
      return;
    }
    this.showPracticeModal.set(true);
  }

  closePracticeModal() {
    this.showPracticeModal.set(false);
  }

  /** Rondas del bracket = log2(equipos); torneo de prueba fijo a 16 → 4 rondas */
  private readonly practiceTeamTotal = 16;

  /** Nombres de equipos bot para torneos de prueba (misma lista que al crear). */
  private readonly practiceBotTeamNames = [
    'Dragones Wayira',
    'Leones del Norte',
    'Águilas Doradas',
    'Tigres Rojos',
    'Lobos Plateados',
    'Halcones Azules',
    'Osos Poderosos',
    'Serpientes Venenosas',
    'Fénix Carmesí',
    'Krakens del Sur',
    'Vikingos de Hielo',
    'Sombras Nocturnas',
    'Rayos Veloces',
    'Titanes Urbanos',
    'Caballeros del Valle',
    'Guardianes Élite'
  ];

  /** Creados con «Torneo de Prueba (…)» — al editar cupo se sincronizan equipos ficticios. */
  private isPracticeTournament(t: Tournament): boolean {
    return (t.name || '').trim().startsWith('Torneo de Prueba');
  }

  /** Ajusta la lista de equipos bot al nuevo cupo: recorta o añade con los mismos nombres por índice. */
  private syncPracticeTeamsForEdit(t: Tournament, targetCount: number): Team[] {
    const tid = t.id!;
    const existing = t.teams || [];
    const names = this.practiceBotTeamNames;
    const out: Team[] = [];
    for (let i = 0; i < targetCount; i++) {
      if (i < existing.length) {
        out.push({ ...existing[i] });
      } else {
        const name = names[i] ?? `Equipo ${i + 1}`;
        out.push({
          id: `team-${tid}-${i}`,
          name,
          captainId: `bot-captain-${i}`,
          captainName: `Bot ${name}`,
          players: [],
          playerInfo: [],
          substitutes: [],
          registeredAt: Timestamp.now()
        });
      }
    }
    return out;
  }

  clearRegistrationImport() {
    this.registrationImportDraft.set(null);
  }

  async onRegistrationFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      alert('Usa un archivo .csv, .xlsx o .xls (desde Excel: «Guardar como» → CSV UTF-8 o .xlsx).');
      return;
    }

    try {
      const rows = await readSpreadsheetFile(file);
      const result = parseRegistrationRows(rows);
      if (result.errors.length) {
        alert(result.errors.join('\n'));
        this.registrationImportDraft.set(null);
        return;
      }
      this.registrationImportDraft.set(result);
      const w = result.warnings.length ? `\n\n${result.warnings.slice(0, 8).join('\n')}` : '';
      alert(`Listo: ${result.teams.length} equipo(s) detectados en «${file.name}». Se cargarán al crear el torneo.${w}`);
    } catch (e: any) {
      console.error(e);
      alert(`No se pudo leer el archivo: ${e?.message || e}`);
      this.registrationImportDraft.set(null);
    }
  }

  async createPracticeTournament() {
    if (!this.isAdmin()) {
      alert('Solo los administradores pueden crear torneos');
      return;
    }

    const teamTotal = this.practiceTeamTotal;
    if (!confirm(`¿Crear un torneo de prueba con ${teamTotal} equipos ficticios? Podrás organizar el bracket y usar la vista interactiva al confirmarlo.`)) {
      return;
    }

    const user = this.firebaseService.getCurrentUser();
    if (!user) return;

    this.creating.set(true);
    this.closePracticeModal();
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);

      const configuredRounds = 4;

      const tournamentId = await this.firebaseService.createTournament({
        name: `Torneo de Prueba (${teamTotal} equipos) - Wayira E-Sports`,
        description:
          'Torneo de prueba con equipos ficticios: organiza las llaves, confirma el bracket y usa la vista interactiva para ganadores y redención.',
        game: 'League of Legends',
        startDate: Timestamp.fromDate(startDate),
        endDate: Timestamp.fromDate(endDate),
        maxTeams: teamTotal,
        format: 'double',
        configuredRounds,
        createdBy: user.uid
      });

      const teamNames = this.practiceBotTeamNames.slice(0, teamTotal);

      const teams: Team[] = teamNames.map((name, index) => ({
        id: `team-${tournamentId}-${index}`,
        name,
        captainId: `bot-captain-${index}`,
        captainName: `Bot ${name}`,
        players: [],
        playerInfo: [],
        substitutes: [],
        registeredAt: Timestamp.now()
      }));

      await this.firebaseService.updateTournament(tournamentId, {
        teams,
        maxTeams: teamTotal,
        configuredRounds,
        confirmed: false,
        status: 'upcoming'
      });

      this.loadTournaments();
      alert(
        `Torneo de prueba creado con ${teams.length} equipos. Abre «Organizar Bracket», confirma y luego usa «Vista interactiva» para clasificaciones.`
      );
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
    this.tournamentFormat.set(tournament.format || 'single');
    this.tournamentConfiguredRounds.set(this.getTournamentConfiguredRounds(tournament));
    
    // Convertir timestamps a formato datetime-local
    const startDate = tournament.startDate.toDate();
    const endDate = tournament.endDate.toDate();
    
    this.tournamentStartDate.set(this.formatDateTimeLocal(startDate));
    this.tournamentEndDate.set(this.formatDateTimeLocal(endDate));
    
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

  // Descargar Excel con información de equipos y miembros
  async downloadTournamentExcel() {
    const tournament = this.selectedTournamentForBracket();
    if (!tournament || !tournament.teams) {
      alert('No hay equipos para exportar');
      return;
    }

    try {
      // Crear contenido CSV (compatible con Excel)
      let csvContent = '\uFEFF'; // BOM para UTF-8 en Excel
      
      // Encabezados
      csvContent += 'Torneo,Equipo,Capitán,Rol,Nombre,Jugador,Email,Teléfono,Invocador,Tagline,Campeón Principal\n';
      
      // Datos de cada equipo
      tournament.teams.forEach((team, teamIndex) => {
        const teamName = team.name || `Equipo ${teamIndex + 1}`;
        const captainName = team.captainName || 'N/A';
        const tournamentName = tournament.name || 'Torneo';
        
        // Si el equipo tiene playerInfo, usar esos datos
        if (team.playerInfo && team.playerInfo.length > 0) {
          team.playerInfo.forEach((player, playerIndex) => {
            csvContent += `"${tournamentName}","${teamName}","${captainName}","${player.role || 'N/A'}","${player.name || 'N/A'}","Jugador ${playerIndex + 1}","${player.email || 'N/A'}","${player.phone || 'N/A'}","${player.gameName || 'N/A'}","${player.tagLine || 'N/A'}","${player.mainChampion || 'N/A'}"\n`;
          });
        } else if (team.players && team.players.length > 0) {
          // Si no hay playerInfo, usar players (legacy)
          team.players.forEach((playerEmail, playerIndex) => {
            csvContent += `"${tournamentName}","${teamName}","${captainName}","N/A","N/A","Jugador ${playerIndex + 1}","${playerEmail}","N/A","N/A","N/A","N/A"\n`;
          });
        } else {
          // Equipo sin jugadores
          csvContent += `"${tournamentName}","${teamName}","${captainName}","N/A","N/A","Sin jugadores","N/A","N/A","N/A","N/A","N/A"\n`;
        }
      });
      
      // Crear blob y descargar
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `${tournament.name.replace(/[^a-z0-9]/gi, '_')}_equipos_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      alert('Excel descargado exitosamente');
    } catch (error) {
      console.error('Error descargando Excel:', error);
      alert('Error al descargar el Excel. Por favor intenta nuevamente.');
    }
  }
}

