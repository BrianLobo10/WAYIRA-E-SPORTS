import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-twitch-embed',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './twitch-embed.component.html',
  styleUrls: ['./twitch-embed.component.css']
})
export class TwitchEmbedComponent implements OnInit {
  isLive = signal(false);
  iframeLoaded = signal(false);
  iframeError = signal(false);
  channelName = 'elxokas';
  twitchUrl = 'https://www.twitch.tv/elxokas';
  safeTwitchUrl: SafeResourceUrl;

  constructor(private sanitizer: DomSanitizer) {
    const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    this.safeTwitchUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://player.twitch.tv/?channel=${this.channelName}&parent=${encodeURIComponent(parent)}&parent=wayiraesports.com&parent=localhost&parent=127.0.0.1&muted=true`
    );
  }

  ngOnInit() {}

  onIframeLoad() {
    this.iframeLoaded.set(true);
    this.iframeError.set(false);
  }

  onIframeError() {
    this.iframeError.set(true);
    this.iframeLoaded.set(false);
  }

  goToTwitch() {
    window.open(this.twitchUrl, '_blank');
  }
}
