import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';
import { FirebaseService } from './services/firebase.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, FooterComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  private firebaseService = inject(FirebaseService);

  ngOnInit() {
    // Iniciar sistema de actualización automática de nombres/tags de invocadores
    this.firebaseService.startSummonerNameUpdateSystem();
  }

  ngOnDestroy() {
    // Detener el sistema cuando la app se cierre
    this.firebaseService.stopSummonerNameUpdateSystem();
  }
}
