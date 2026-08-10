import { Component, input, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TwitchLiveService } from '../../services/twitch-live.service';
import { SOCIAL_LINKS } from '../../config/social.config';

@Component({
  selector: 'app-twitch-embed',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './twitch-embed.component.html',
  styleUrls: ['./twitch-embed.component.css']
})
export class TwitchEmbedComponent {
  layout = input<'default' | 'compact' | 'sidebar'>('default');
  private twitchLive = inject(TwitchLiveService);

  iframeLoaded = signal(false);
  iframeError = signal(false);
  channelName = SOCIAL_LINKS.twitchLogin;
  twitchUrl = SOCIAL_LINKS.twitch;
  safeTwitchUrl: SafeResourceUrl;

  twitchIsLive = this.twitchLive.isLive;

  constructor(private sanitizer: DomSanitizer) {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const parentList = [host, 'localhost', '127.0.0.1', 'wayiraesports.com', 'wayira-e-sports.web.app'];
    const parentQuery = parentList.map(p => `parent=${encodeURIComponent(p)}`).join('&');
    this.safeTwitchUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://player.twitch.tv/?channel=${this.channelName}&${parentQuery}&muted=true`
    );
  }

  onIframeLoad() {
    this.iframeLoaded.set(true);
    this.iframeError.set(false);
  }

  onIframeError() {
    this.iframeError.set(true);
    this.iframeLoaded.set(false);
  }

  goToTwitch() {
    window.open(this.twitchUrl, '_blank', 'noopener');
  }
}
