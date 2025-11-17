import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconComponent } from '../svg-icon/svg-icon.component';

export type CardType = 'service' | 'valor' | 'about';

@Component({
  selector: 'app-universal-card',
  standalone: true,
  imports: [CommonModule, SvgIconComponent],
  templateUrl: './universal-card.component.html',
  styleUrls: ['./universal-card.component.css']
})
export class UniversalCardComponent {
  @Input() icon: string = '';
  @Input() title: string = '';
  @Input() description: string = '';
  @Input() type: CardType = 'service';
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
}
