import { Component, Input, ContentChildren, QueryList, AfterContentInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UniversalCardComponent } from '../universal-card/universal-card.component';

@Component({
  selector: 'app-cards-grid',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cards-grid.component.html',
  styleUrls: ['./cards-grid.component.css']
})
export class CardsGridComponent implements AfterContentInit {
  @Input() columns: number = 3;
  @Input() gap: 'small' | 'medium' | 'large' = 'medium';
  @Input() responsive: boolean = true;
  
  @ContentChildren(UniversalCardComponent) cards!: QueryList<UniversalCardComponent>;
  
  ngAfterContentInit() {
    this.cards.forEach(card => {
    });
  }
  
  get gridClass(): string {
    return `grid-${this.columns} gap-${this.gap} ${this.responsive ? 'responsive' : ''}`;
  }
}
