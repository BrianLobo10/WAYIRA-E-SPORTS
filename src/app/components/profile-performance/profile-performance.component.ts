import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface RiotStats {
  winRate: number;
  wins: number;
  losses: number;
  kda: number;
  wayiraScore: number;
  totalGames: number;
}

export interface Last4WeeksStats {
  winRate: number;
  kda: number;
  games: number;
  wins: number;
  losses: number;
}

@Component({
  selector: 'app-profile-performance',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-performance.component.html',
  styleUrls: ['./profile-performance.component.css']
})
export class ProfilePerformanceComponent {
  loading = input<boolean>(false);
  riotStats = input<RiotStats | null>(null);
  last4Weeks = input<Last4WeeksStats | null>(null);
  totalMatchesThisYear = input<number>(0);
  periodLabel = input<string>('Last 4 Weeks');
}
