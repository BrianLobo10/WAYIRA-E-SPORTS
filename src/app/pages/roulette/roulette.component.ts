import { Component, ElementRef, ViewChild, AfterViewInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-roulette',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './roulette.component.html',
  styleUrls: ['./roulette.component.css']
})
export class RouletteComponent implements AfterViewInit {
  @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

  options = signal<string[]>([]);
  optionsText = signal('');
  isSpinning = signal(false);
  winner = signal<string | null>(null);
  showWinner = signal(false);
  winnerTimer = signal(15);
  currentSpinningText = signal('');
  private winnerTimerInterval: any = null;

  private startAngle = 0;
  private arc = 0;
  private spinTimeout: any = null;
  private spinAngleStart = 0;
  private spinTime = 0;
  private spinTimeTotal = 0;
  private ctx: CanvasRenderingContext2D | null = null;

  ngAfterViewInit() {
    this.updateOptions();
    this.drawRouletteWheel();
  }

  onTextChange() {
    this.updateOptions();
    this.drawRouletteWheel();
  }

  updateOptions() {
    const text = this.optionsText();
    if (text.trim()) {
      const newOptions = text.split('\n')
        .map(option => option.trim())
        .filter(option => option.length > 0);
      this.options.set(newOptions);
      this.arc = Math.PI / (newOptions.length / 2);
    } else {
      this.options.set([]);
    }
  }

  spin() {
    if (this.isSpinning() || this.options().length < 2) return;

    this.isSpinning.set(true);
    this.winner.set(null);
    this.showWinner.set(false);

    this.spinAngleStart = Math.random() * 10 + 10;
    this.spinTime = 0;
    this.spinTimeTotal = 8000;
    this.rotateWheel();
  }

  private rotateWheel() {
    this.spinTime += 16;
    if (this.spinTime >= this.spinTimeTotal) {
      this.stopRotateWheel();
      return;
    }
    
    const progress = this.spinTime / this.spinTimeTotal;
    let spinAngle;
    
    if (progress < 0.15) {
      const phaseProgress = progress / 0.15;
      spinAngle = this.spinAngleStart * (1 - phaseProgress * 0.1);
    } else if (progress < 0.4) {
      spinAngle = this.spinAngleStart * 0.9;
    } else if (progress < 0.7) {
      const phaseProgress = (progress - 0.4) / 0.3;
      const easedProgress = this.easeInOut(phaseProgress, 0, 1, 1);
      spinAngle = this.spinAngleStart * (0.9 - easedProgress * 0.4);
    } else {
      const phaseProgress = (progress - 0.7) / 0.3;
      const easedProgress = this.easeOut(phaseProgress, 0, 1, 1);
      spinAngle = this.spinAngleStart * 0.5 * (1 - easedProgress);
    }
    
    spinAngle = Math.max(spinAngle, 0.1);
    
    this.startAngle += (spinAngle * Math.PI / 180);
    
    this.updateCurrentSpinningText();
    this.drawRouletteWheel();
    this.spinTimeout = setTimeout(() => this.rotateWheel(), 16);
  }

  private updateCurrentSpinningText() {
    const options = this.options();
    if (options.length === 0) return;
    
    const segmentAngle = 360 / options.length;
    const currentAngle = (this.startAngle * 180 / Math.PI + 90) % 360;
    const normalizedAngle = (360 - currentAngle) % 360;
    const currentIndex = Math.floor(normalizedAngle / segmentAngle);
    const currentText = options[currentIndex] || options[0];
    
    this.currentSpinningText.set(currentText);
  }

  private stopRotateWheel() {
    clearTimeout(this.spinTimeout);
    this.isSpinning.set(false);

    const degrees = this.startAngle * 180 / Math.PI + 90;
    const arcd = this.arc * 180 / Math.PI;
    const index = Math.floor((360 - degrees % 360) / arcd);
    const winner = this.options()[index];
    
    this.winner.set(winner);
    this.showWinner.set(true);
    this.startWinnerTimer();
  }

  private startWinnerTimer() {
    this.winnerTimer.set(15);
    this.winnerTimerInterval = setInterval(() => {
      const currentTimer = this.winnerTimer();
      if (currentTimer <= 1) {
        this.closeWinnerModal();
      } else {
        this.winnerTimer.set(currentTimer - 1);
      }
    }, 1000);
  }

  closeWinnerModal() {
    this.showWinner.set(false);
    this.winner.set(null);
    this.winnerTimer.set(15);
    if (this.winnerTimerInterval) {
      clearInterval(this.winnerTimerInterval);
      this.winnerTimerInterval = null;
    }
  }

  private easeOut(t: number, b: number, c: number, d: number): number {
    const ts = (t /= d) * t;
    const tc = ts * t;
    return b + c * (tc + -3 * ts + 3 * t);
  }

  private easeInOut(t: number, b: number, c: number, d: number): number {
    const ts = (t /= d) * t;
    const tc = ts * t;
    return b + c * (tc * -2 + 3 * ts);
  }

  private getColor(item: number, maxitem: number): string {
    const colors = [
      '#016C6C',
      '#006968', 
      '#00363D',
      '#014C4A',
      '#9146ff',
      '#5865f2',
      '#E74C3C',
      '#F39C12',
      '#27AE60',
      '#3498DB',
      '#9B59B6',
      '#E67E22',
      '#1ABC9C',
      '#34495E',
      '#E91E63',
      '#FF5722',
      '#607D8B',
      '#795548',
      '#FF9800',
      '#4CAF50'
    ];
    
    return colors[item % colors.length];
  }

  private drawRouletteWheel() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const outsideRadius = 220;
    const textRadius = 150;
    const insideRadius = 80;

    this.ctx = canvas.getContext('2d');
    if (!this.ctx) return;

    this.ctx.clearRect(0, 0, 550, 550);

    this.ctx.strokeStyle = "#016C6C";
    this.ctx.lineWidth = 3;
    this.ctx.font = 'bold 14px Arial, sans-serif';

    const options = this.options();
    if (options.length === 0) return;

    for (let i = 0; i < options.length; i++) {
      const angle = this.startAngle + i * this.arc;
      this.ctx.fillStyle = this.getColor(i, options.length);

      this.ctx.beginPath();
      this.ctx.arc(275, 275, outsideRadius, angle, angle + this.arc, false);
      this.ctx.arc(275, 275, insideRadius, angle + this.arc, angle, true);
      this.ctx.stroke();
      this.ctx.fill();

      this.ctx.save();
      this.ctx.translate(275 + Math.cos(angle + this.arc / 2) * textRadius, 
                        275 + Math.sin(angle + this.arc / 2) * textRadius);
      
      const text = options[i];
      this.ctx.rotate(angle + this.arc / 2 + Math.PI / 2 + Math.PI / 2);
      
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      this.ctx.shadowBlur = 4;
      this.ctx.shadowOffsetX = 2;
      this.ctx.shadowOffsetY = 2;
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(text, 0, 0);
      
      this.ctx.restore();
    }

    const arrowY = 275 - (outsideRadius + 5);
    const arrowTipY = 275 - (outsideRadius - 13);
    
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    this.ctx.shadowBlur = 10;
    this.ctx.shadowOffsetX = 2;
    this.ctx.shadowOffsetY = 2;
    
    this.ctx.fillStyle = '#016C6C';
    this.ctx.beginPath();
    this.ctx.moveTo(275 - 6, arrowY);
    this.ctx.lineTo(275 + 6, arrowY);
    this.ctx.lineTo(275 + 6, arrowY + 8);
    this.ctx.lineTo(275 + 12, arrowY + 8);
    this.ctx.lineTo(275 + 0, arrowTipY);
    this.ctx.lineTo(275 - 12, arrowY + 8);
    this.ctx.lineTo(275 - 6, arrowY + 8);
    this.ctx.lineTo(275 - 6, arrowY);
    this.ctx.fill();
  }
}
