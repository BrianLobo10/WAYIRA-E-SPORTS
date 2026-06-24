import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { SummonerSearchComponent } from './pages/summoner-search/summoner-search.component';
import { RouletteComponent } from './pages/roulette/roulette.component';
import { ContactComponent } from './pages/contact/contact.component';
import { AboutComponent } from './pages/about/about.component';
import { ProjectsComponent } from './pages/projects/projects.component';
import { NewsComponent } from './pages/news/news.component';
import { LoginComponent } from './pages/auth/login/login.component';
import { RegisterComponent } from './pages/auth/register/register.component';
import { BlogComponent } from './pages/blog/blog.component';
import { FeedComponent } from './pages/feed/feed.component';
import { ExploreUsersComponent } from './pages/explore-users/explore-users.component';
import { ProfileComponent } from './pages/profile/profile.component';
import { MessagesComponent } from './pages/messages/messages.component';
import { TournamentsComponent } from './pages/tournaments/tournaments.component';
import { sessionGuard } from './guards/session.guard';
import { guestGuard } from './guards/guest.guard';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent
  },
  {
    path: 'search',
    component: SummonerSearchComponent
  },
  {
    path: 'roulette',
    component: RouletteComponent
  },
  {
    path: 'contact',
    component: ContactComponent,
    canActivate: [sessionGuard]
  },
  {
    path: 'about',
    component: AboutComponent
  },
  {
    path: 'projects',
    component: ProjectsComponent
  },
  {
    path: 'news',
    component: NewsComponent
  },
  {
    path: 'feed',
    component: FeedComponent,
    canActivate: [sessionGuard]
  },
  {
    path: 'explore',
    component: ExploreUsersComponent,
    canActivate: [sessionGuard]
  },
  {
    path: 'blog',
    redirectTo: 'feed',
    pathMatch: 'full'
  },
  {
    path: 'blog/post/:id',
    loadComponent: () => import('./pages/blog/post-view/post-view.component').then(m => m.PostViewComponent),
    canActivate: [sessionGuard]
  },
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [guestGuard]
  },
  {
    path: 'register',
    component: RegisterComponent,
    canActivate: [guestGuard]
  },
  {
    path: 'profile/:id',
    component: ProfileComponent,
    canActivate: [sessionGuard]
  },
  {
    path: 'profile',
    component: ProfileComponent,
    canActivate: [sessionGuard]
  },
  {
    path: 'messages',
    component: MessagesComponent,
    canActivate: [sessionGuard]
  },
  {
    path: 'tournaments',
    component: TournamentsComponent
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
