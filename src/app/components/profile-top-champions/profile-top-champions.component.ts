import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ChampionDisplay {
  championId: number;
  championName: string;
  points: number;
  level: number;
  winRate?: number;
  imageUrl: string;
}

@Component({
  selector: 'app-profile-top-champions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-top-champions.component.html',
  styleUrls: ['./profile-top-champions.component.css']
})
export class ProfileTopChampionsComponent {
  champions = input.required<ChampionDisplay[]>();
  periodLabel = input<string>('Last 4 Weeks');
  maxShow = input<number>(8);
}
