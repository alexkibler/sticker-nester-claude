import { Component, Output, EventEmitter, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  STANDARD_SHEET_SIZES,
  StandardSheetSize,
  UnitSystem,
  UnitConverter,
  SheetSizeConfig,
  getCurrentDimensions
} from '../models/sheet-size.interface';

/**
 * ControlPanelComponent provides user controls
 *
 * Features:
 * - Unit system toggle (metric/imperial)
 * - Sheet size dropdown with standard sizes
 * - Custom size input (when selected)
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

        <!-- Unit System Toggle -->
        <div class="form-group unit-toggle">
          <label>Unit System:</label>
          <div class="toggle-buttons">
            <button
              type="button"
              class="toggle-btn"
              [class.active]="unitSystem === 'imperial'"
              (click)="setUnitSystem('imperial')"
            >
              Imperial (in)
            </button>
            <button
              type="button"
              class="toggle-btn"
              [class.active]="unitSystem === 'metric'"
              (click)="setUnitSystem('metric')"
            >
              Metric (mm)
            </button>
          </div>
        </div>

        <!-- Production Mode -->
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

        <!-- Polygon Packing Mode -->
        <div class="form-group">
          <label>
            <input
              type="checkbox"
              [(ngModel)]="config.usePolygonPacking"
              (change)="onConfigChange()"
              class="checkbox-input"
            />
            Use Polygon Packing
          </label>
          <small class="help-text">
            Uses actual sticker shapes for better packing (slower but more accurate for irregular shapes)
          </small>
        </div>

        <!-- Number of Sheets -->
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

        <!-- Sheet Size Dropdown -->
        <div class="form-group">
          <label>Sheet Size:</label>
          <select
            [(ngModel)]="selectedSizeId"
            (change)="onSheetSizeChange()"
            class="sheet-size-select"
          >
            <option *ngFor="let size of standardSheetSizes" [value]="size.id">
              {{ getSheetSizeName(size) }}
            </option>
          </select>
        </div>

        <!-- Custom Dimensions (shown only when Custom is selected) -->
        <div *ngIf="isCustomSize" class="custom-dimensions">
          <div class="form-group">
            <label>Width {{ unitLabel }}:</label>
            <input
              type="number"
              [(ngModel)]="customWidthDisplay"
              [min]="minDimension"
              [max]="maxDimension"
              [step]="dimensionStep"
              (change)="onCustomDimensionChange()"
            />
          </div>

          <div class="form-group">
            <label>Height {{ unitLabel }}:</label>
            <input
              type="number"
              [(ngModel)]="customHeightDisplay"
              [min]="minDimension"
              [max]="maxDimension"
              [step]="dimensionStep"
              (change)="onCustomDimensionChange()"
            />
          </div>
        </div>

        <!-- Margin -->
        <div class="form-group">
          <label>Margin {{ unitLabel }}:</label>
          <input
            type="number"
            [(ngModel)]="marginDisplay"
            [min]="0"
            [max]="marginMax"
            [step]="marginStep"
            (change)="onMarginChange()"
          />
        </div>

        <!-- Spacing -->
        <div class="form-group">
          <label>Spacing {{ unitLabel }}:</label>
          <input
            type="number"
            [(ngModel)]="spacingDisplay"
            [min]="0"
            [max]="marginMax"
            [step]="marginStep"
            (change)="onSpacingChange()"
          />
        </div>

        <!-- Max Sticker Dimension -->
        <div class="form-group max-dimension-highlight">
          <label class="highlight-label">
            Max Sticker Dimension {{ unitLabel }}:
          </label>
          <input
            type="number"
            [(ngModel)]="maxDimensionDisplay"
            [min]="0.1"
            [max]="maxDimension"
            [step]="dimensionStep"
            (change)="onMaxDimensionChange()"
            class="highlight-input"
          />
          <small class="help-text">
            All uploaded stickers will be scaled so their largest dimension equals this value
          </small>
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

    /* Unit toggle styles */
    .unit-toggle {
      margin-bottom: 20px;
    }

    .toggle-buttons {
      display: flex;
      gap: 0;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid #ddd;
    }

    .toggle-btn {
      flex: 1;
      padding: 8px 12px;
      border: none;
      background-color: white;
      color: #666;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border-right: 1px solid #ddd;
    }

    .toggle-btn:last-child {
      border-right: none;
    }

    .toggle-btn:hover {
      background-color: #f5f5f5;
    }

    .toggle-btn.active {
      background-color: #4CAF50;
      color: white;
    }

    /* Custom dimensions highlight */
    .custom-dimensions {
      padding: 12px;
      background-color: #f0f8f0;
      border-radius: 4px;
      margin-bottom: 15px;
      border: 1px dashed #4CAF50;
    }

    .custom-dimensions .form-group {
      margin-bottom: 10px;
    }

    .custom-dimensions .form-group:last-child {
      margin-bottom: 0;
    }

    .sheet-size-select {
      font-weight: 500;
    }

    /* Max dimension highlight */
    .max-dimension-highlight {
      padding: 12px;
      background-color: #fff9e6;
      border-radius: 4px;
      margin-top: 15px;
      border: 2px solid #ff9800;
    }

    .highlight-label {
      font-weight: 700 !important;
      color: #e67e22 !important;
    }

    .highlight-input {
      border: 2px solid #ff9800 !important;
      background-color: white;
    }

    .highlight-input:focus {
      outline: none;
      border-color: #f57c00 !important;
      box-shadow: 0 0 0 3px rgba(255, 152, 0, 0.1);
    }

    .help-text {
      display: block;
      margin-top: 6px;
      font-size: 11px;
      color: #666;
      font-style: italic;
      line-height: 1.4;
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

    @media (max-width: 1024px) {
      .control-panel {
        max-width: 100%;
      }
    }

    @media (max-width: 768px) {
      .control-panel {
        padding: 15px;
      }
    }

    @media (max-width: 480px) {
      .control-panel {
        padding: 10px;
      }

      h3 {
        font-size: 16px;
      }

      .toggle-btn {
        font-size: 12px;
        padding: 6px 8px;
      }
    }
  `]
})
export class ControlPanelComponent implements OnInit {
  @Input() canStartNesting = false;
  @Input() canExport = false;
  @Input() canReset = false;
  @Input() isNesting = false;
  @Input() status: any = null;

  @Output() configChanged = new EventEmitter<any>();
  @Output() startNesting = new EventEmitter<void>();
  @Output() exportPdf = new EventEmitter<void>();
  @Output() reset = new EventEmitter<void>();

  // Configuration (internal storage in MM)
  config = {
    productionMode: false,
    sheetCount: 5,
    sheetWidthMM: 215.9,     // Letter width in mm
    sheetHeightMM: 279.4,    // Letter height in mm
    marginMM: 3.175,         // 0.125" in mm
    spacingMM: 1.5875,       // 0.0625" in mm
    maxDimensionMM: 76.2,    // 3" in mm - max dimension for ALL stickers
    unit: 'inches' as 'inches' | 'mm',  // User's preferred unit
    usePolygonPacking: false,  // Use polygon-based packing instead of rectangle packing
    cellsPerInch: 100,         // Grid resolution for polygon packing
    stepSize: 0.05             // Position search step size for polygon packing (inches)
  };

  // Sheet size state
  standardSheetSizes = STANDARD_SHEET_SIZES;
  selectedSizeId = 'letter'; // Default to Letter
  unitSystem: UnitSystem = 'imperial'; // Default to imperial

  // Display values (converted based on unit system)
  customWidthDisplay = 12;
  customHeightDisplay = 12;
  marginDisplay = 0.125;
  spacingDisplay = 0.0625;
  maxDimensionDisplay = 3; // Default 3 inches

  ngOnInit(): void {
    // Initialize display values based on current config
    this.updateDisplayValues();
    this.emitConfig();
  }

  /**
   * Check if custom size is selected
   */
  get isCustomSize(): boolean {
    return this.selectedSizeId === 'custom';
  }

  /**
   * Get unit label for display
   */
  get unitLabel(): string {
    return this.unitSystem === 'imperial' ? '(inches)' : '(mm)';
  }

  /**
   * Get dimension constraints based on unit system
   */
  get minDimension(): number {
    return this.unitSystem === 'imperial' ? 1 : 25.4;
  }

  get maxDimension(): number {
    return this.unitSystem === 'imperial' ? 24 : 609.6;
  }

  get dimensionStep(): number {
    return this.unitSystem === 'imperial' ? 0.1 : 1;
  }

  get marginMax(): number {
    return this.unitSystem === 'imperial' ? 1 : 25.4;
  }

  get marginStep(): number {
    return this.unitSystem === 'imperial' ? 0.0625 : 0.5;
  }

  /**
   * Set unit system and update display values
   */
  setUnitSystem(system: UnitSystem): void {
    this.unitSystem = system;
    this.updateDisplayValues();
  }

  /**
   * Get formatted sheet size name based on current unit system
   */
  getSheetSizeName(size: StandardSheetSize): string {
    return UnitConverter.formatSheetSizeName(size, this.unitSystem);
  }

  /**
   * Handle sheet size dropdown change
   */
  onSheetSizeChange(): void {
    if (this.selectedSizeId === 'custom') {
      // Custom size - use current display values
      this.onCustomDimensionChange();
    } else {
      // Standard size - get dimensions from predefined list
      const selectedSize = this.standardSheetSizes.find(s => s.id === this.selectedSizeId);
      if (selectedSize) {
        this.config.sheetWidthMM = selectedSize.widthMM;
        this.config.sheetHeightMM = selectedSize.heightMM;
        this.updateDisplayValues();
        this.emitConfig();
      }
    }
  }

  /**
   * Handle custom dimension changes
   */
  onCustomDimensionChange(): void {
    if (this.unitSystem === 'imperial') {
      this.config.sheetWidthMM = UnitConverter.inchesToMM(this.customWidthDisplay);
      this.config.sheetHeightMM = UnitConverter.inchesToMM(this.customHeightDisplay);
    } else {
      this.config.sheetWidthMM = this.customWidthDisplay;
      this.config.sheetHeightMM = this.customHeightDisplay;
    }

    // Validate custom dimensions
    const validation = UnitConverter.validateCustomDimensions(
      this.config.sheetWidthMM,
      this.config.sheetHeightMM
    );

    if (!validation.valid) {
      alert(validation.error);
      // Reset to valid values
      this.config.sheetWidthMM = UnitConverter.inchesToMM(12);
      this.config.sheetHeightMM = UnitConverter.inchesToMM(12);
      this.updateDisplayValues();
    }

    this.emitConfig();
  }

  /**
   * Handle margin change
   */
  onMarginChange(): void {
    if (this.unitSystem === 'imperial') {
      this.config.marginMM = UnitConverter.inchesToMM(this.marginDisplay);
    } else {
      this.config.marginMM = this.marginDisplay;
    }
    this.emitConfig();
  }

  /**
   * Handle spacing change
   */
  onSpacingChange(): void {
    if (this.unitSystem === 'imperial') {
      this.config.spacingMM = UnitConverter.inchesToMM(this.spacingDisplay);
    } else {
      this.config.spacingMM = this.spacingDisplay;
    }
    this.emitConfig();
  }

  /**
   * Handle max dimension change
   */
  onMaxDimensionChange(): void {
    if (this.unitSystem === 'imperial') {
      this.config.maxDimensionMM = UnitConverter.inchesToMM(this.maxDimensionDisplay);
      this.config.unit = 'inches';
    } else {
      this.config.maxDimensionMM = this.maxDimensionDisplay;
      this.config.unit = 'mm';
    }
    this.emitConfig();
  }

  /**
   * Update display values based on internal MM values
   */
  private updateDisplayValues(): void {
    if (this.unitSystem === 'imperial') {
      this.customWidthDisplay = parseFloat(UnitConverter.mmToInches(this.config.sheetWidthMM).toFixed(2));
      this.customHeightDisplay = parseFloat(UnitConverter.mmToInches(this.config.sheetHeightMM).toFixed(2));
      this.marginDisplay = parseFloat(UnitConverter.mmToInches(this.config.marginMM).toFixed(4));
      this.spacingDisplay = parseFloat(UnitConverter.mmToInches(this.config.spacingMM).toFixed(4));
      this.maxDimensionDisplay = parseFloat(UnitConverter.mmToInches(this.config.maxDimensionMM).toFixed(2));
      this.config.unit = 'inches';
    } else {
      this.customWidthDisplay = parseFloat(this.config.sheetWidthMM.toFixed(1));
      this.customHeightDisplay = parseFloat(this.config.sheetHeightMM.toFixed(1));
      this.marginDisplay = parseFloat(this.config.marginMM.toFixed(1));
      this.spacingDisplay = parseFloat(this.config.spacingMM.toFixed(1));
      this.maxDimensionDisplay = parseFloat(this.config.maxDimensionMM.toFixed(1));
      this.config.unit = 'mm';
    }
  }

  /**
   * Handle production mode or sheet count changes
   */
  onConfigChange(): void {
    this.emitConfig();
  }

  /**
   * Emit configuration to parent component
   */
  private emitConfig(): void {
    this.configChanged.emit({
      productionMode: this.config.productionMode,
      sheetCount: this.config.sheetCount,
      sheetWidthMM: this.config.sheetWidthMM,
      sheetHeightMM: this.config.sheetHeightMM,
      marginMM: this.config.marginMM,
      spacingMM: this.config.spacingMM,
      maxDimensionMM: this.config.maxDimensionMM,
      unit: this.config.unit,
      usePolygonPacking: this.config.usePolygonPacking,
      cellsPerInch: this.config.cellsPerInch,
      stepSize: this.config.stepSize
    });
  }
}
