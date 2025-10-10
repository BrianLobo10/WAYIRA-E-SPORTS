import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-section-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="section-header">
      <h2 class="section-title">{{ title }}</h2>
      <div class="title-underline"></div>
    </div>
  `,
  styleUrls: ['./section-header.component.css']
})
export class SectionHeaderComponent {
  @Input() title: string = '';
}
