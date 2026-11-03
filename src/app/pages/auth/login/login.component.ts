import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SocialAuthButtonsComponent } from '../../../components/social-auth-buttons/social-auth-buttons.component';
import { SecureStorageService } from '../../../services/secure-storage.service';
import { getStoredReturnUrl, safeInternalPath } from '../../../guards/session.guard';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, SocialAuthButtonsComponent],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly storage = inject(SecureStorageService);

  /** A dónde volver tras iniciar sesión. */
  readonly returnPath =
    safeInternalPath(this.route.snapshot.queryParamMap.get('next')) ??
    getStoredReturnUrl(this.route.snapshot.queryParamMap.get('r'), this.storage);

  /** Si el usuario canceló o el proveedor falló, Supabase vuelve con ?error_description=… */
  readonly providerError = this.route.snapshot.queryParamMap.get('error_description')
    ? 'No se completó el inicio de sesión. Intenta de nuevo.'
    : null;
}
