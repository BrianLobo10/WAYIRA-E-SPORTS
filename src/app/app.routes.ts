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
    path: 'profile/:id',
    loadComponent: () => import('./pages/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [sessionGuard]
  },
  {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [sessionGuard]
  },
  {
    // Panel de staff: buzón de contacto y roles (cualquier permiso de staff; cada sección revisa el suyo)
    path: 'staff',
    loadComponent: () => import('./pages/staff/staff.component').then(m => m.StaffComponent),
    canActivate: [adminGuard],
    title: 'Panel de staff · WAYIRA E-SPORTS'
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
    redirectTo: ''
  }
];
