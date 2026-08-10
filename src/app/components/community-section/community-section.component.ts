import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SOCIAL_LINKS } from '../../config/social.config';

interface SocialCard {
  name: string;
  icon: string;
  theme: 'discord' | 'twitch' | 'instagram' | 'facebook';
  action: () => void;
}

@Component({
  selector: 'app-community-section',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './community-section.component.html',
  styleUrls: ['./community-section.component.css']
})
export class CommunitySectionComponent {
  readonly socialCards: SocialCard[] = [
    {
      name: 'Discord',
      icon: 'forum',
      theme: 'discord',
      action: () => this.goToDiscord()
    },
    {
      name: 'Twitch',
      icon: 'live_tv',
      theme: 'twitch',
      action: () => this.goToTwitch()
    },
    {
      name: 'Instagram',
      icon: 'photo_camera',
      theme: 'instagram',
      action: () => this.goToInstagram()
    },
    {
      name: 'Facebook',
      icon: 'thumb_up',
      theme: 'facebook',
      action: () => this.goToFacebook()
    }
  ];

  goToDiscord() {
    window.open(SOCIAL_LINKS.discord, '_blank', 'noopener');
  }

  goToTwitch() {
    window.open(SOCIAL_LINKS.twitch, '_blank', 'noopener');
  }

  goToInstagram() {
    window.open(SOCIAL_LINKS.instagram, '_blank', 'noopener');
  }

  goToFacebook() {
    window.open(SOCIAL_LINKS.facebook, '_blank', 'noopener');
  }
}
