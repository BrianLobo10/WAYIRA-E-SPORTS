import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';
import { ChatbotComponent } from './components/chatbot/chatbot.component';
import { TwitchLiveService } from './services/twitch-live.service';
import { FeedbackHostComponent } from './components/feedback/feedback-host.component';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, FooterComponent, ChatbotComponent, FeedbackHostComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  private twitchLive = inject(TwitchLiveService);
  private theme = inject(ThemeService);

  ngOnInit() {
    // Colores elegidos por el Superadmin (si no hay, se queda el original de styles.css)
    void this.theme.load();
    this.twitchLive.startPolling();
  }

  ngOnDestroy() {
    this.twitchLive.stopPolling();
  }
}
