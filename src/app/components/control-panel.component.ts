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

        <!-- Rotation Granularity (only shown when polygon packing is enabled) -->
        <div class="form-group" *ngIf="config.usePolygonPacking">
          <label>Rotation Granularity:</label>
          <select
            [(ngModel)]="config.rotationPreset"
            (change)="onRotationPresetChange()"
            class="rotation-preset-select"
          >
            <option value="90">90° Only (Fast)</option>
            <option value="45">45° Steps (Balanced)</option>
            <option value="15">15° Steps (Recommended)</option>
            <option value="10">10° Steps (High Quality)</option>
            <option value="5">5° Steps (Maximum Quality)</option>
          </select>
          <small class="help-text">
            {{ getRotationPresetDescription() }}
          </small>
        </div>

        <!-- Optimizer Selection (only shown when polygon packing is enabled) -->
        <div class="form-group optimizer-section" *ngIf="config.usePolygonPacking">
          <label class="optimizer-label">🧬 Optimizer:</label>
          <select
            [(ngModel)]="config.optimizer"
            (change)="onOptimizerChange()"
            class="optimizer-select"
          >
            <option value="greedy">Greedy (Fast - 15-30s)</option>
            <option value="annealing">Simulated Annealing (2-4 min)</option>
            <option value="genetic">Genetic Algorithm (8-15 min)</option>
          </select>
          <small class="help-text">
            {{ getOptimizerDescription() }}
          </small>
        </div>

        <!-- Simulated Annealing Configuration -->
        <div class="optimizer-config" *ngIf="config.usePolygonPacking && config.optimizer === 'annealing'">
          <h4 class="config-subtitle">⚙️ Annealing Settings</h4>

          <div class="form-group compact">
            <label>Temperature:</label>
            <input
              type="number"
              [(ngModel)]="config.annealingConfig.temperature"
              min="50"
              max="200"
              step="10"
              (change)="onConfigChange()"
            />
            <small class="help-text">Higher = more exploration (50-200)</small>
          </div>

          <div class="form-group compact">
            <label>Cooling Rate:</label>
            <input
              type="number"
              [(ngModel)]="config.annealingConfig.coolingRate"
              min="0.85"
              max="0.99"
              step="0.01"
              (change)="onConfigChange()"
            />
            <small class="help-text">Slower cooling = better quality (0.85-0.99)</small>
          </div>

          <div class="form-group compact">
            <label>Iterations:</label>
            <input
              type="number"
              [(ngModel)]="config.annealingConfig.iterations"
              min="100"
              max="1000"
              step="100"
              (change)="onConfigChange()"
            />
            <small class="help-text">More = better quality, slower (100-1000)</small>
          </div>

          <button
            type="button"
            class="preset-btn"
            (click)="setAnnealingPreset('fast')"
          >
            Fast (1 min)
          </button>
          <button
            type="button"
            class="preset-btn"
            (click)="setAnnealingPreset('balanced')"
          >
            Balanced (2 min)
          </button>
          <button
            type="button"
            class="preset-btn"
            (click)="setAnnealingPreset('best')"
          >
            Best (5 min)
          </button>
        </div>

        <!-- Genetic Algorithm Configuration -->
        <div class="optimizer-config" *ngIf="config.usePolygonPacking && config.optimizer === 'genetic'">
          <h4 class="config-subtitle">🧬 Genetic Settings</h4>

          <div class="form-group compact">
            <label>Population Size:</label>
            <input
              type="number"
              [(ngModel)]="config.geneticConfig.populationSize"
              min="10"
              max="100"
              step="10"
              (change)="onConfigChange()"
            />
            <small class="help-text">More = better quality, slower (10-100)</small>
          </div>

          <div class="form-group compact">
            <label>Generations:</label>
            <input
              type="number"
              [(ngModel)]="config.geneticConfig.generations"
              min="20"
              max="300"
              step="10"
              (change)="onConfigChange()"
            />
            <small class="help-text">More = better convergence (20-300)</small>
          </div>

          <div class="form-group compact">
            <label>Mutation Rate:</label>
            <input
              type="number"
              [(ngModel)]="config.geneticConfig.mutationRate"
              min="0.05"
              max="0.3"
              step="0.05"
              (change)="onConfigChange()"
            />
            <small class="help-text">Higher = more exploration (0.05-0.3)</small>
          </div>

          <button
            type="button"
            class="preset-btn"
            (click)="setGeneticPreset('fast')"
          >
            Fast (5 min)
          </button>
          <button
            type="button"
            class="preset-btn"
            (click)="setGeneticPreset('balanced')"
          >
            Balanced (10 min)
          </button>
          <button
            type="button"
            class="preset-btn"
            (click)="setGeneticPreset('best')"
          >
            Best (30 min)
          </button>
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

    .rotation-preset-select {
      font-weight: 500;
      background-color: #f0f8ff;
      border: 1px solid #4CAF50;
    }

    .rotation-preset-select:focus {
      border-color: #45a049;
      background-color: #e8f5e9;
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

    /* Optimizer section styles */
    .optimizer-section {
      padding: 12px;
      background-color: #f0f4ff;
      border-radius: 4px;
      margin-top: 15px;
      border: 2px solid #2196F3;
    }

    .optimizer-label {
      font-weight: 700 !important;
      color: #2196F3 !important;
    }

    .optimizer-select {
      font-weight: 500;
      background-color: white;
      border: 2px solid #2196F3;
    }

    .optimizer-select:focus {
      border-color: #0b7dda;
      background-color: #f8fbff;
    }

    /* Optimizer configuration panel */
    .optimizer-config {
      margin-top: 12px;
      padding: 12px;
      background-color: white;
      border-radius: 4px;
      border: 1px solid #ddd;
    }

    .config-subtitle {
      margin: 0 0 12px 0;
      font-size: 14px;
      color: #2196F3;
      font-weight: 600;
    }

    /* Compact form groups for optimizer config */
    .form-group.compact {
      margin-bottom: 10px;
    }

    .form-group.compact label {
      font-size: 13px;
      margin-bottom: 4px;
    }

    .form-group.compact input {
      padding: 6px;
      font-size: 13px;
    }

    .form-group.compact .help-text {
      font-size: 10px;
      margin-top: 3px;
    }

    /* Preset buttons */
    .preset-btn {
      display: inline-block;
      padding: 6px 12px;
      margin: 4px 4px 4px 0;
      border: 1px solid #2196F3;
      border-radius: 4px;
      background-color: white;
      color: #2196F3;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .preset-btn:hover {
      background-color: #2196F3;
      color: white;
    }

    .preset-btn:active {
      transform: scale(0.95);
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
    rotationPreset: '15',      // Rotation granularity: '90', '45', '15', '10', '5'
    cellsPerInch: 50,          // Grid resolution for polygon packing (default from 15° preset)
    stepSize: 0.1,             // Position search step size for polygon packing in inches (default from 15° preset)
    optimizer: 'greedy' as 'greedy' | 'annealing' | 'genetic',  // Optimizer algorithm
    annealingConfig: {
      temperature: 100,        // Initial temperature (50-200)
      coolingRate: 0.95,       // Cooling rate per iteration (0.85-0.99)
      iterations: 500          // Number of iterations (100-1000)
    },
    geneticConfig: {
      populationSize: 30,      // Number of solutions in population (10-100)
      generations: 100,        // Number of generations (20-300)
      mutationRate: 0.15       // Probability of mutation (0.05-0.3)
    }
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
   * Handle rotation preset change
   * Updates cellsPerInch and stepSize based on selected preset
   */
  onRotationPresetChange(): void {
    // Update optimized parameters based on preset
    switch (this.config.rotationPreset) {
      case '90':
        this.config.cellsPerInch = 100;
        this.config.stepSize = 0.05;
        break;
      case '45':
        this.config.cellsPerInch = 75;
        this.config.stepSize = 0.075;
        break;
      case '15':
        this.config.cellsPerInch = 50;
        this.config.stepSize = 0.1;
        break;
      case '10':
        this.config.cellsPerInch = 50;
        this.config.stepSize = 0.1;
        break;
      case '5':
        this.config.cellsPerInch = 40;
        this.config.stepSize = 0.15;
        break;
      default:
        this.config.cellsPerInch = 50;
        this.config.stepSize = 0.1;
    }
    this.emitConfig();
  }

  /**
   * Get description for selected rotation preset
   */
  getRotationPresetDescription(): string {
    switch (this.config.rotationPreset) {
      case '90':
        return '4 rotations (0°, 90°, 180°, 270°). Fastest, best for rectangular stickers.';
      case '45':
        return '8 rotations. Good for diagonal shapes, 1.5x slower.';
      case '15':
        return '24 rotations. Best balance of quality and speed. Often faster than 90° preset!';
      case '10':
        return '36 rotations. High quality for complex shapes, ~2-3x slower.';
      case '5':
        return '72 rotations. Maximum quality, ~4x slower. Best for expensive materials.';
      default:
        return '';
    }
  }

  /**
   * Handle optimizer change
   */
  onOptimizerChange(): void {
    this.emitConfig();
  }

  /**
   * Get description for selected optimizer
   */
  getOptimizerDescription(): string {
    switch (this.config.optimizer) {
      case 'greedy':
        return 'Bottom-left heuristic with edge-touching search. Fast and reliable (75-90% utilization).';
      case 'annealing':
        return 'Probabilistic hill climbing with random jumps. Better quality (80-92% utilization), 8-10x slower.';
      case 'genetic':
        return 'Population-based evolution. Best quality (85-95% utilization), 30-60x slower.';
      default:
        return '';
    }
  }

  /**
   * Set simulated annealing preset
   */
  setAnnealingPreset(preset: 'fast' | 'balanced' | 'best'): void {
    switch (preset) {
      case 'fast':
        this.config.annealingConfig = {
          temperature: 75,
          coolingRate: 0.92,
          iterations: 300
        };
        break;
      case 'balanced':
        this.config.annealingConfig = {
          temperature: 100,
          coolingRate: 0.95,
          iterations: 500
        };
        break;
      case 'best':
        this.config.annealingConfig = {
          temperature: 150,
          coolingRate: 0.97,
          iterations: 800
        };
        break;
    }
    this.emitConfig();
  }

  /**
   * Set genetic algorithm preset
   */
  setGeneticPreset(preset: 'fast' | 'balanced' | 'best'): void {
    switch (preset) {
      case 'fast':
        this.config.geneticConfig = {
          populationSize: 20,
          generations: 50,
          mutationRate: 0.2
        };
        break;
      case 'balanced':
        this.config.geneticConfig = {
          populationSize: 30,
          generations: 100,
          mutationRate: 0.15
        };
        break;
      case 'best':
        this.config.geneticConfig = {
          populationSize: 50,
          generations: 200,
          mutationRate: 0.1
        };
        break;
    }
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
      rotationPreset: this.config.rotationPreset,
      cellsPerInch: this.config.cellsPerInch,
      stepSize: this.config.stepSize,
      optimizer: this.config.optimizer,
      annealingConfig: this.config.annealingConfig,
      geneticConfig: this.config.geneticConfig
    });
  }
}
