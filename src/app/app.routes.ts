import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { SummonerSearchComponent } from './pages/summoner-search/summoner-search.component';
import { RouletteComponent } from './pages/roulette/roulette.component';
import { ContactComponent } from './pages/contact/contact.component';

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
    component: ContactComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];
