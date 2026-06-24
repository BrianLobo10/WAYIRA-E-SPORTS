import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TwitchEmbedComponent } from '../../components/twitch-embed/twitch-embed.component';
import { CommunitySectionComponent } from '../../components/community-section/community-section.component';

@Component({
  selector: 'app-home',
  imports: [RouterLink, TwitchEmbedComponent, CommunitySectionComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {}

