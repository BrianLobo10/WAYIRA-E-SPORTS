import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';
import { ChatbotComponent } from './components/chatbot/chatbot.component';
import { FirebaseService } from './services/firebase.service';
import { TwitchLiveService } from './services/twitch-live.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, FooterComponent, ChatbotComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  private firebaseService = inject(FirebaseService);
  private twitchLive = inject(TwitchLiveService);

  ngOnInit() {
    this.twitchLive.startPolling();
    this.firebaseService.startSummonerNameUpdateSystem();
  }

  ngOnDestroy() {
    this.twitchLive.stopPolling();
    this.firebaseService.stopSummonerNameUpdateSystem();
  }
}
