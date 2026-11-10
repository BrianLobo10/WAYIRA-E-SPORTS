import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { sessionGuard } from './guards/session.guard';
import { guestGuard } from './guards/guest.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent
  },
  {
    path: 'search',
    loadComponent: () => import('./pages/summoner-search/summoner-search.component').then(m => m.SummonerSearchComponent)
  },
  {
    path: 'sorteos',
    loadComponent: () => import('./pages/roulette/roulette.component').then(m => m.RouletteComponent),
    title: 'Sorteos · WAYIRA E-SPORTS'
  },
  {
    // Enlaces antiguos a la ruleta siguen funcionando
    path: 'roulette',
    redirectTo: 'sorteos'
  },
  {
    path: 'contact',
    // Cualquiera puede escribir, con o sin cuenta (el servidor limita los envíos)
    loadComponent: () => import('./pages/contact/contact.component').then(m => m.ContactComponent)
  },
  {
    path: 'about',
    loadComponent: () => import('./pages/about/about.component').then(m => m.AboutComponent)
  },
  {
    path: 'projects',
    loadComponent: () => import('./pages/projects/projects.component').then(m => m.ProjectsComponent)
  },
  {
    path: 'news',
    loadComponent: () => import('./pages/news/news.component').then(m => m.NewsComponent)
  },
  {
    path: 'feed',
    loadComponent: () => import('./pages/feed/feed.component').then(m => m.FeedComponent),
    canActivate: [sessionGuard]
  },
  {
    path: 'explore',
    loadComponent: () => import('./pages/explore-users/explore-users.component').then(m => m.ExploreUsersComponent),
    canActivate: [sessionGuard]
  },
  {
    path: 'blog',
    redirectTo: 'feed',
    pathMatch: 'full'
  },
  {
    // Enlaces viejos a publicaciones: ahora todo está en el Feed
    path: 'blog/post/:id',
    redirectTo: 'feed'
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/auth/login/login.component').then(m => m.LoginComponent),
    canActivate: [guestGuard]
  },
  {
    // Entrar y registrarse son lo mismo con Google/Discord: la cuenta se crea al primer ingreso
    path: 'register',
    redirectTo: 'login'
  },
  {
    // Perfil público en modo lectura: los visitantes lo ven sin sesión (la base solo entrega columnas públicas)
    path: 'profile/:id',
    loadComponent: () => import('./pages/profile/profile.component').then(m => m.ProfileComponent)
  },
  {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [sessionGuard]
  },
  {
    // Panel de staff: el marco pide cualquier permiso de staff; cada sección pide su permiso exacto
    path: 'staff',
    loadComponent: () => import('./pages/staff/panel-shell.component').then(m => m.PanelShellComponent),
    canActivate: [adminGuard],
    data: { area: 'staff' },
    title: 'Panel de staff · WAYIRA E-SPORTS',
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/staff/staff-home.component').then(m => m.StaffHomeComponent) },
      {
        path: 'proyectos', canActivate: [adminGuard], data: { permission: 'site.content' }, title: 'Proyectos · Panel de staff',
        loadComponent: () => import('./pages/staff/staff-projects.component').then(m => m.StaffProjectsComponent)
      },
      {
        path: 'noticias', canActivate: [adminGuard], data: { permission: 'news.manage' }, title: 'Noticias · Panel de staff',
        loadComponent: () => import('./pages/staff/staff-news.component').then(m => m.StaffNewsComponent)
      },
      {
        path: 'torneos', canActivate: [adminGuard], data: { permission: 'tournaments.manage', kind: 'torneos' }, title: 'Torneos · Panel de staff',
        loadComponent: () => import('./pages/staff/staff-events.component').then(m => m.StaffEventsComponent)
      },
      {
        path: 'sorteos', canActivate: [adminGuard], data: { permission: 'giveaways.manage', kind: 'sorteos' }, title: 'Sorteos · Panel de staff',
        loadComponent: () => import('./pages/staff/staff-events.component').then(m => m.StaffEventsComponent)
      },
      {
        path: 'buzon', canActivate: [adminGuard], data: { permission: 'contact.read', section: 'buzon' }, title: 'Buzón · Panel de staff',
        loadComponent: () => import('./pages/staff/staff.component').then(m => m.StaffComponent)
      },
      {
        path: 'roles', canActivate: [adminGuard], data: { permission: 'roles.assign', section: 'roles' }, title: 'Roles · Panel de staff',
        loadComponent: () => import('./pages/staff/staff.component').then(m => m.StaffComponent)
      },
    ]
  },
  {
    // Centro de control: solo Superadmin (platform.stats es exclusivo de ese rol)
    path: 'control',
    loadComponent: () => import('./pages/staff/panel-shell.component').then(m => m.PanelShellComponent),
    canActivate: [adminGuard],
    data: { area: 'control', permission: 'platform.stats' },
    title: 'Centro de control · WAYIRA E-SPORTS',
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'resumen' },
      {
        path: 'resumen', canActivate: [adminGuard], data: { permission: 'platform.stats' }, title: 'Resumen · Centro de control',
        loadComponent: () => import('./pages/control/control-summary.component').then(m => m.ControlSummaryComponent)
      },
      {
        path: 'usuarios', canActivate: [adminGuard], data: { permission: 'users.view' }, title: 'Usuarios · Centro de control',
        loadComponent: () => import('./pages/control/control-users.component').then(m => m.ControlUsersComponent)
      },
      {
        path: 'apariencia', canActivate: [adminGuard], data: { permission: 'site.theme' }, title: 'Apariencia · Centro de control',
        loadComponent: () => import('./pages/control/control-theme.component').then(m => m.ControlThemeComponent)
      },
      {
        path: 'auditoria', canActivate: [adminGuard], data: { permission: 'audit.view' }, title: 'Auditoría · Centro de control',
        loadComponent: () => import('./pages/control/control-audit.component').then(m => m.ControlAuditComponent)
      },
    ]
  },
  {
    path: 'privacidad',
    title: 'Privacidad y condiciones · WAYIRA E-SPORTS',
    loadComponent: () => import('./pages/legal/legal.component').then(m => m.LegalComponent)
  },
  {
    path: '403',
    data: { code: 403 },
    title: 'Sin permiso · WAYIRA E-SPORTS',
    loadComponent: () => import('./pages/error/error-page.component').then(m => m.ErrorPageComponent)
  },
  {
    path: 'messages',
    loadComponent: () => import('./pages/messages/messages.component').then(m => m.MessagesComponent),
    canActivate: [sessionGuard]
  },
  {
    path: 'tournaments',
    loadComponent: () => import('./pages/tournaments/tournaments.component').then(m => m.TournamentsComponent)
  },
  {
    path: 'tournaments/:tournamentId/vista-interactiva',
    loadComponent: () =>
      import('./pages/tournaments/tournament-bracket-interactive/tournament-bracket-interactive.component').then(
        m => m.TournamentBracketInteractiveComponent
      )
  },
  {
    path: 'tournaments/historial',
    loadComponent: () =>
      import('./pages/tournaments/tournament-history/tournament-history.component').then(m => m.TournamentHistoryComponent)
  },
  {
    path: 'tournaments/historial/:tournamentId',
    loadComponent: () =>
      import('./pages/tournaments/tournament-history/tournament-history-detail.component').then(
        m => m.TournamentHistoryDetailComponent
      )
  },
  {
    path: '**',
    data: { code: 404 },
    title: 'Página no encontrada · WAYIRA E-SPORTS',
    loadComponent: () => import('./pages/error/error-page.component').then(m => m.ErrorPageComponent)
  }
];
