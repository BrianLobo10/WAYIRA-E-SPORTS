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
import { ProfileComponent } from './pages/profile/profile.component';
import { MessagesComponent } from './pages/messages/messages.component';
import { TournamentsComponent } from './pages/tournaments/tournaments.component';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
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
    canActivate: [authGuard]
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
    path: 'blog',
    component: BlogComponent,
    canActivate: [authGuard]
  },
  {
    path: 'blog/post/:id',
    loadComponent: () => import('./pages/blog/post-view/post-view.component').then(m => m.PostViewComponent),
    canActivate: [authGuard]
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
    canActivate: [authGuard]
  },
  {
    path: 'profile',
    component: ProfileComponent,
    canActivate: [authGuard]
  },
  {
    path: 'messages',
    component: MessagesComponent,
    canActivate: [authGuard]
  },
  {
    path: 'tournaments',
    component: TournamentsComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];
