import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-community-section',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './community-section.component.html',
  styleUrls: ['./community-section.component.css']
})
export class CommunitySectionComponent {
  discordUrl = 'https://discord.gg/HHBMumv8S';
  facebookUrl = 'https://www.facebook.com/share/1TtgfPoLSL/';
  instagramUrl = 'https://www.instagram.com/wayiraesports?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==';

  goToDiscord() {
    window.open(this.discordUrl, '_blank');
  }

  goToFacebook() {
    window.open(this.facebookUrl, '_blank');
  }

  goToInstagram() {
    window.open(this.instagramUrl, '_blank');
  }
}
