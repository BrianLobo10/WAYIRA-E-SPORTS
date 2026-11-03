import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SocialAuthButtonsComponent } from '../../../components/social-auth-buttons/social-auth-buttons.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [RouterLink, SocialAuthButtonsComponent],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent {}
