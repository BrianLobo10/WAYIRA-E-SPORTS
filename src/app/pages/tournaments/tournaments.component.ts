import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FirebaseService, Tournament, UserProfile, Team, BracketMatch, PlayerInfo } from '../../services/firebase.service';
import { Timestamp } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';

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
  
  // Bracket view
  selectedTournamentForBracket = signal<Tournament | null>(null);
  showBracket = signal(false);
  organizingBracket = signal(false); // Si está en modo organización
  bracketTeams = signal<Team[]>([]); // Equipos organizados para el bracket
  draggedTeam: Team | null = null;
  bracketSlots: Array<{ team: Team | null; position: number }> = [];
  bracketMatches: Array<{ team1: Team | null; team2: Team | null; matchIndex: number }> = []; // Enfrentamientos por parejas
  
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

  teamCounts = [2, 4, 8, 16, 32, 64]; // Incluir 2 para versus

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
          const bracket = this.firebaseService.generateBracket(updatedTournament.teams);
          await this.firebaseService.updateTournament(tournament.id!, {
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
    // Cargar equipos en los slots basándose en su orden en el array
    teams.forEach((team, index) => {
      if (index < this.bracketSlots.length) {
        this.bracketSlots[index].team = team;
      }
    });
    
    // Cargar equipos en enfrentamientos (parejas)
    const numMatches = Math.floor(teams.length / 2);
    for (let i = 0; i < numMatches; i++) {
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
      const numMatches = Math.floor(confirmedTeams.length / 2);
      this.bracketMatches = Array(numMatches).fill(null).map((_, i) => ({
        team1: confirmedTeams[i * 2] || null,
        team2: confirmedTeams[i * 2 + 1] || null,
        matchIndex: i
      }));
      return;
    }
    
    // Si no está confirmado, inicializar dinámicamente según equipos registrados
    // Calcular número de enfrentamientos basado en equipos registrados
    // Si hay equipos registrados, usar esa cantidad; si no, usar maxTeams
    const teamsForBracket = numRegisteredTeams > 0 ? numRegisteredTeams : tournament.maxTeams;
    
    // Asegurar que sea par para los enfrentamientos (redondear hacia arriba si es impar)
    // Pero mínimo 2 equipos (versus)
    const actualTeamCount = Math.max(teamsForBracket, 2);
    
    // Inicializar slots individuales (para compatibilidad)
    this.bracketSlots = Array(actualTeamCount).fill(null).map((_, i) => ({
      team: null,
      position: i
    }));
    
    // Inicializar enfrentamientos VACÍOS - dinámico e inteligente
    // Los equipos se arrastrarán desde la lista
    const numMatches = Math.ceil(actualTeamCount / 2);
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
    // Verificar que todos los enfrentamientos tengan ambos equipos
    return this.bracketMatches.every(match => match.team1 !== null && match.team2 !== null);
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
    // El equipo vuelve a la lista automáticamente al quitarse del enfrentamiento
    this.bracketMatches[matchIndex][teamPosition] = null;
    this.syncMatchesToSlots();
    // La lista se actualiza automáticamente gracias a getAvailableTeams()
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
    
    // Verificar que todos los enfrentamientos estén completos
    const incompleteMatches = this.bracketMatches.filter(m => !m.team1 || !m.team2);
    if (incompleteMatches.length > 0) {
      alert(`Debes completar todos los enfrentamientos. Faltan ${incompleteMatches.length} enfrentamientos.`);
      return;
    }
    
    // Obtener equipos desde los enfrentamientos, en orden de los enfrentamientos
    const teams: Team[] = [];
    this.bracketMatches.forEach(match => {
      if (match.team1) teams.push(match.team1);
      if (match.team2) teams.push(match.team2);
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
      const bracket = this.firebaseService.generateBracketWithOrder(teams);
      
      // Actualizar el torneo en Firebase
      await this.firebaseService.updateTournament(tournament.id!, {
        confirmed: true,
        confirmedAt: Timestamp.now(),
        bracket: bracket,
        teams: teams
      });
      
      // Recargar la lista de torneos
      this.loadTournaments();
      
      // Actualizar directamente el torneo seleccionado con los nuevos datos
      const updatedTournament: Tournament = {
        ...tournament,
        confirmed: true,
        confirmedAt: Timestamp.now(),
        bracket: bracket,
        teams: teams
      };
      
      this.selectedTournamentForBracket.set(updatedTournament);
      
      // Cambiar a vista del bracket visual (no organizar)
      this.organizingBracket.set(false);
      
      alert('Bracket confirmado exitosamente. Mostrando tabla de clasificaciones.');
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
        playerInfo: [], // Array vacío para compatibilidad
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

