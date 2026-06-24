import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ActivityCell {
  level: number;
  count: number;
  dateKey?: string;
}

export interface ActivityTimelineData {
  months: { monthIndex: number; monthLabel: string }[];
  days: number[];
  /** key = "monthIndex-dayNum" */
  cells: Record<string, ActivityCell>;
  total: number;
  /** Total de partidas por mes (índice 0 = Ene, 11 = Dic) para vista por mes */
  monthlyTotals?: number[];
}

@Component({
  selector: 'app-profile-activity-timeline',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-activity-timeline.component.html',
  styleUrls: ['./profile-activity-timeline.component.css']
})
export class ProfileActivityTimelineComponent {
  data = input.required<ActivityTimelineData>();
  hint = input<string>('Orden cronológico: días 1–31 por mes; cada fila es un mes (Ene–Dic).');
  totalLabel = input<string>('Este año');
  activitiesLabel = input<string>('actividades');

  /** Máximo de partidas en un mes (para escalar las barras). */
  getMaxMonthlyCount(): number {
    const d = this.data();
    if (!d.monthlyTotals || d.monthlyTotals.length === 0) return 1;
    return Math.max(1, ...d.monthlyTotals);
  }

  getCell(monthIndex: number, dayNum: number): ActivityCell | null {
    const d = this.data();
    const key = `${monthIndex}-${dayNum}`;
    const cell = d.cells[key];
    return cell ?? null;
  }

  tooltip(cell: ActivityCell): string {
    if (!cell.dateKey) return `${cell.count} partida(s)`;
    const [, m, dayStr] = cell.dateKey.split('-');
    const months: Record<string, string> = {
      '01': 'enero', '02': 'febrero', '03': 'marzo', '04': 'abril', '05': 'mayo', '06': 'junio',
      '07': 'julio', '08': 'agosto', '09': 'septiembre', '10': 'octubre', '11': 'noviembre', '12': 'diciembre'
    };
    const day = parseInt(dayStr, 10);
    const month = months[m] || m;
    return `${day} ${month}: ${cell.count} partida(s)`;
  }
}
