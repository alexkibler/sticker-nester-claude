import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * ProgressBarComponent - Reusable progress bar with label
 */
@Component({
  selector: 'app-progress-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="progress-container" *ngIf="visible">
      <div class="progress-label">
        <span class="label-text">{{ label }}</span>
        <span class="progress-text">{{ progressText }}</span>
      </div>
      <div class="progress-bar-wrapper">
        <div
          class="progress-bar-fill"
          [style.width.%]="progress"
          [class.complete]="progress === 100"
        ></div>
      </div>
    </div>
  `,
  styles: [`
    .progress-container {
      width: 100%;
      margin: 16px 0;
      padding: 12px;
      background: #f5f5f5;
      border-radius: 8px;
      border: 1px solid #e0e0e0;
    }

    .progress-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-size: 14px;
    }

    .label-text {
      font-weight: 500;
      color: #333;
    }

    .progress-text {
      color: #666;
      font-size: 13px;
    }

    .progress-bar-wrapper {
      width: 100%;
      height: 8px;
      background: #e0e0e0;
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #4CAF50 0%, #45a049 100%);
      border-radius: 4px;
      transition: width 0.3s ease;
      position: relative;
    }

    .progress-bar-fill.complete {
      background: linear-gradient(90deg, #2196F3 0%, #1976D2 100%);
    }

    .progress-bar-fill::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      right: 0;
      background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(255, 255, 255, 0.3) 50%,
        transparent 100%
      );
      animation: shimmer 1.5s infinite;
    }

    @keyframes shimmer {
      0% {
        transform: translateX(-100%);
      }
      100% {
        transform: translateX(100%);
      }
    }
  `]
})
export class ProgressBarComponent {
  @Input() label: string = '';
  @Input() progress: number = 0;
  @Input() visible: boolean = false;
  @Input() current?: number;
  @Input() total?: number;

  get progressText(): string {
    if (this.current !== undefined && this.total !== undefined) {
      return `${this.current} / ${this.total} (${this.progress}%)`;
    }
    return `${this.progress}%`;
  }
}
