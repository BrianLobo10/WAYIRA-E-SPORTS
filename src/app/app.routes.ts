import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { SummonerSearchComponent } from './pages/summoner-search/summoner-search.component';

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
    path: '**',
    redirectTo: ''
  }
];
