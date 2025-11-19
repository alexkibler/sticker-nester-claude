import { Component, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * ControlPanelComponent provides user controls
 *
 * Features:
 * - Sheet size configuration
 * - Margin settings
 * - Nesting parameters
 * - Start/Stop controls
 * - Export button
 */
@Component({
  selector: 'app-control-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="control-panel">
      <div class="section">
        <h3>Sheet Settings</h3>

        <div class="form-group">
          <label>
            <input
              type="checkbox"
              [(ngModel)]="config.productionMode"
              (change)="onConfigChange()"
              class="checkbox-input"
            />
            Production Mode (Multiple Sheets)
          </label>
        </div>

        <div class="form-group" *ngIf="config.productionMode">
          <label>Number of Sheets:</label>
          <input
            type="number"
            [(ngModel)]="config.sheetCount"
            min="1"
            max="100"
            step="1"
            (change)="onConfigChange()"
          />
        </div>

        <div class="form-group">
          <label>Width (inches):</label>
          <input
            type="number"
            [(ngModel)]="config.sheetWidth"
            min="1"
            max="48"
            step="0.5"
            (change)="onConfigChange()"
          />
        </div>

        <div class="form-group">
          <label>Height (inches):</label>
          <input
            type="number"
            [(ngModel)]="config.sheetHeight"
            min="1"
            max="48"
            step="0.5"
            (change)="onConfigChange()"
          />
        </div>

        <div class="form-group">
          <label>Margin (inches):</label>
          <input
            type="number"
            [(ngModel)]="config.margin"
            min="0"
            max="1"
            step="0.0625"
            (change)="onConfigChange()"
          />
        </div>

        <div class="form-group">
          <label>Spacing (inches):</label>
          <input
            type="number"
            [(ngModel)]="config.spacing"
            min="0"
            max="1"
            step="0.0625"
            (change)="onConfigChange()"
          />
        </div>
      </div>

      <div class="section">
        <h3>Nesting Options</h3>

        <div class="form-group">
          <label>Rotations:</label>
          <select [(ngModel)]="config.rotations" (change)="onConfigChange()">
            <option [value]="1">No Rotation</option>
            <option [value]="2">0°, 180°</option>
            <option [value]="4">0°, 90°, 180°, 270°</option>
          </select>
        </div>

        <div class="form-group">
          <label>Population Size:</label>
          <input
            type="number"
            [(ngModel)]="config.populationSize"
            min="10"
            max="100"
            step="10"
            (change)="onConfigChange()"
          />
        </div>

        <div class="form-group">
          <label>Mutation Rate:</label>
          <input
            type="number"
            [(ngModel)]="config.mutationRate"
            min="0"
            max="1"
            step="0.1"
            (change)="onConfigChange()"
          />
        </div>
      </div>

      <div class="section">
        <h3>Actions</h3>

        <button
          class="btn btn-primary"
          [disabled]="!canStartNesting || isNesting"
          (click)="startNesting.emit()"
        >
          {{ isNesting ? 'Nesting...' : 'Start Nesting' }}
        </button>

        <button
          class="btn btn-success"
          [disabled]="!canExport"
          (click)="exportPdf.emit()"
        >
          Export PDF
        </button>

        <button
          class="btn btn-outline"
          [disabled]="!canReset"
          (click)="reset.emit()"
        >
          Reset
        </button>
      </div>

      <div class="section" *ngIf="status">
        <h3>Status</h3>
        <div class="status-info">
          <p *ngIf="status.generation !== undefined">
            Generation: {{ status.generation }}
          </p>
          <p *ngIf="status.fitness !== undefined">
            Fitness: {{ status.fitness.toFixed(2) }}
          </p>
          <p *ngIf="status.utilization !== undefined">
            Utilization: {{ status.utilization.toFixed(1) }}%
          </p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .control-panel {
      padding: 20px;
      background-color: #f9f9f9;
      border-radius: 4px;
      max-width: 300px;
    }

    .section {
      margin-bottom: 25px;
      padding-bottom: 20px;
      border-bottom: 1px solid #ddd;
    }

    .section:last-child {
      border-bottom: none;
      margin-bottom: 0;
    }

    h3 {
      margin: 0 0 15px 0;
      font-size: 18px;
      color: #333;
    }

    .form-group {
      margin-bottom: 15px;
    }

    label {
      display: block;
      margin-bottom: 5px;
      font-size: 14px;
      color: #666;
      font-weight: 500;
    }

    input[type="number"],
    select {
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      box-sizing: border-box;
    }

    input[type="number"]:focus,
    select:focus {
      outline: none;
      border-color: #4CAF50;
    }

    .checkbox-input {
      width: auto;
      margin-right: 8px;
      cursor: pointer;
    }

    label:has(.checkbox-input) {
      display: flex;
      align-items: center;
      cursor: pointer;
      font-weight: 600;
      color: #4CAF50;
    }

    .btn {
      width: 100%;
      padding: 10px;
      margin-bottom: 10px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background-color: #4CAF50;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background-color: #45a049;
    }

    .btn-secondary {
      background-color: #ff9800;
      color: white;
    }

    .btn-secondary:hover:not(:disabled) {
      background-color: #e68900;
    }

    .btn-success {
      background-color: #2196F3;
      color: white;
    }

    .btn-success:hover:not(:disabled) {
      background-color: #0b7dda;
    }

    .btn-outline {
      background-color: white;
      color: #666;
      border: 1px solid #ddd;
    }

    .btn-outline:hover:not(:disabled) {
      background-color: #f5f5f5;
    }

    .status-info {
      background-color: white;
      padding: 10px;
      border-radius: 4px;
      font-size: 14px;
    }

    .status-info p {
      margin: 5px 0;
      color: #666;
    }
  `]
})
export class ControlPanelComponent {
  @Input() canStartNesting = false;
  @Input() canExport = false;
  @Input() canReset = false;
  @Input() isNesting = false;
  @Input() status: any = null;

  @Output() configChanged = new EventEmitter<any>();
  @Output() startNesting = new EventEmitter<void>();
  @Output() exportPdf = new EventEmitter<void>();
  @Output() reset = new EventEmitter<void>();

  config = {
    productionMode: false,
    sheetCount: 5,
    sheetWidth: 12,
    sheetHeight: 12,
    margin: 0.125,
    spacing: 0.0625,
    rotations: 4,
    populationSize: 30,
    mutationRate: 0.3
  };

  onConfigChange(): void {
    this.configChanged.emit(this.config);
  }
}
