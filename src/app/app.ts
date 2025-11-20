import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

// Components
import { UploadDropzoneComponent } from './components/upload-dropzone.component';
import { CanvasPreviewComponent } from './components/canvas-preview.component';
import { ControlPanelComponent } from './components/control-panel.component';
import { ProgressBarComponent } from './components/progress-bar.component';

// Services
import {
  ImageAnalysisService,
  ApiService
} from './services';

// Models
import {
  StickerSource,
  Placement,
  UnitConverter
} from './models';

import { SheetPlacement } from './services/api.service';

/**
 * Main application component
 *
 * Orchestrates the entire sticker nesting workflow:
 * 1. Upload images
 * 2. Process images (trace, simplify, offset)
 * 3. Run nesting algorithm in Web Worker
 * 4. Display preview
 * 5. Export to PDF
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    UploadDropzoneComponent,
    CanvasPreviewComponent,
    ControlPanelComponent,
    ProgressBarComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  // State signals
  protected readonly title = signal('Mosaic');
  stickers: StickerSource[] = [];
  placements: Placement[] = [];
  sheets: SheetPlacement[] = [];
  isNesting = false;
  isProcessing = false;
  currentGeneration = 0;
  currentFitness = 0;
  utilization = 0;
  quantities: { [stickerId: string]: number } = {};

  // Progress tracking
  uploadProgress = 0;
  showUploadProgress = false;
  pdfProgress = 0;
  pdfCurrentPage = 0;
  pdfTotalPages = 0;
  showPdfProgress = false;
  nestingProgress = 0;
  nestingMessage = '';
  showNestingProgress = false;

  // Configuration (stored in millimeters)
  config = {
    productionMode: false,
    sheetCount: 5,
    sheetWidthMM: 215.9,     // Letter width in mm (8.5")
    sheetHeightMM: 279.4,    // Letter height in mm (11")
    marginMM: 3.175,         // 0.125" in mm
    spacingMM: 1.5875,       // 0.0625" in mm
    maxDimensionMM: 76.2,    // 3" in mm - max dimension for ALL stickers
    unit: 'inches' as 'inches' | 'mm',  // User's preferred unit
    usePolygonPacking: false,  // Use polygon-based packing instead of rectangle packing
    cellsPerInch: 100,         // Grid resolution for polygon packing
    stepSize: 0.05             // Position search step size for polygon packing (inches)
  };

  private subscriptions = new Subscription();

  constructor(
    private imageAnalysis: ImageAnalysisService,
    private apiService: ApiService
  ) {}

  ngOnInit(): void {
    // Connect to Socket.IO for real-time nesting progress
    this.apiService.connectSocket();

    // Subscribe to nesting events
    this.subscriptions.add(
      this.apiService.onNestingProgress().subscribe(progress => {
        console.log('Nesting progress:', progress);
        // Update UI with progress
        this.updateNestingProgress(progress);
      })
    );

    this.subscriptions.add(
      this.apiService.onNestingComplete().subscribe(({ jobId, result }) => {
        console.log('Nesting complete:', jobId, result);
        this.handleNestingComplete(result);
      })
    );

    this.subscriptions.add(
      this.apiService.onNestingError().subscribe(({ jobId, error }) => {
        console.error('Nesting error:', jobId, error);
        alert(`Nesting error: ${error}`);
        this.isNesting = false;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.apiService.disconnectSocket();
  }

  /**
   * Handle file uploads
   */
  async onFilesSelected(files: File[]): Promise<void> {
    this.isProcessing = true;
    this.showUploadProgress = true;
    this.uploadProgress = 0;

    try {
      // Calculate max dimension in user's preferred unit
      const maxDimension = this.config.unit === 'inches'
        ? this.config.maxDimensionMM / 25.4
        : this.config.maxDimensionMM;

      // Process all files via backend API with progress tracking
      const processedImages = await this.apiService.processImages(
        files,
        maxDimension,
        this.config.unit,
        (progress) => {
          this.uploadProgress = progress;
        }
      );

      // Create sticker objects with processed data
      for (let i = 0; i < processedImages.length; i++) {
        const processed = processedImages[i];
        const file = files[i];

        const sticker: StickerSource = {
          id: processed.id,
          file,
          bitmap: await this.imageAnalysis.loadImageBitmap(file),
          inputDimensions: {
            width: processed.width,
            height: processed.height,
            unit: 'mm'
          },
          originalPath: processed.path,
          simplifiedPath: processed.path,
          offsetPath: processed.path,
          margin: this.config.marginMM,
          isProcessed: true
        };

        this.stickers.push(sticker);
      }

      // Automatically run nesting after upload
      this.showUploadProgress = false;
      this.isProcessing = false;
      await this.onStartNesting();
    } catch (error) {
      console.error('Error processing files:', error);
      alert('Error processing files. Please try again.');
      this.showUploadProgress = false;
      this.isProcessing = false;
    }
  }

  /**
   * Handle file input change event
   */
  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.onFilesSelected(Array.from(input.files));
    }
  }


  /**
   * Start nesting algorithm
   */
  async onStartNesting(): Promise<void> {
    if (this.stickers.length === 0) {
      alert('Please upload some stickers first');
      return;
    }

    this.isNesting = true;
    this.placements = [];
    this.sheets = [];

    try {
      // Prepare request payload (all dimensions in mm)
      const requestPayload: any = {
        stickers: this.stickers.map(s => ({
          id: s.id,
          points: s.simplifiedPath,
          width: s.inputDimensions.width,
          height: s.inputDimensions.height
        })),
        sheetWidth: this.config.sheetWidthMM,
        sheetHeight: this.config.sheetHeightMM,
        spacing: this.config.spacingMM,
        productionMode: this.config.productionMode,
        sheetCount: this.config.sheetCount,
        usePolygonPacking: this.config.usePolygonPacking,
        cellsPerInch: this.config.cellsPerInch,
        stepSize: this.config.stepSize
      };

      // Add quantities for production mode
      if (this.config.productionMode) {
        requestPayload.quantities = {};

        // Calculate total available area (in square mm)
        const totalSheetArea = this.config.sheetWidthMM * this.config.sheetHeightMM * this.config.sheetCount;

        // Calculate total sticker area (sum of all unique stickers)
        const totalStickerArea = this.stickers.reduce((sum, s) =>
          sum + (s.inputDimensions.width * s.inputDimensions.height), 0);

        // Estimate how many copies of each sticker set we can fit
        // Aim for 100% utilization - the packer will skip items that don't fit
        const estimatedCopies = Math.max(1, Math.ceil(totalSheetArea / totalStickerArea));

        // Set quantities: use user-specified if available, otherwise use estimated copies
        this.stickers.forEach(s => {
          requestPayload.quantities[s.id] = this.quantities[s.id] || estimatedCopies;
        });

        console.log(`Auto-calculated quantities: ${estimatedCopies} copies of each sticker to fill ${this.config.sheetCount} sheets`);
      }

      // Call backend API for nesting
      const response = await this.apiService.nestStickers(requestPayload);

      // Check if this is async polygon packing (returns a job ID)
      if (response.jobId) {
        console.log(`Polygon packing job started: ${response.jobId}`);
        this.showNestingProgress = true;
        this.nestingProgress = 0;
        this.nestingMessage = 'Starting polygon packing...';
        // Result will be handled via Socket.IO events
        // Don't set isNesting to false yet - wait for completion
        return;
      }

      // Handle synchronous response (rectangle packing)
      this.handleNestingComplete(response);
    } catch (error) {
      console.error('Nesting error:', error);
      alert('Error running nesting algorithm. Please try again.');
      this.isNesting = false;
      this.showNestingProgress = false;
    }
  }

  /**
   * Update nesting progress from Socket.IO events
   */
  private updateNestingProgress(progress: any): void {
    this.nestingProgress = progress.percentComplete || 0;
    this.nestingMessage = progress.message || 'Processing...';
  }

  /**
   * Handle nesting completion (from both sync and async paths)
   */
  private handleNestingComplete(response: any): void {
    try {
      // Handle multi-sheet response
      if (response.sheets && response.sheets.length > 0) {
        this.sheets = response.sheets;
        this.utilization = response.totalUtilization || 0;
        this.quantities = response.quantities || {};
        // For preview compatibility, use first sheet's placements
        this.placements = response.sheets[0].placements;
      } else {
        // Single sheet response
        this.placements = response.placements || [];
        this.utilization = response.utilization || 0;
        this.currentFitness = response.fitness || 0;
      }

      console.log(`Nesting complete: ${this.placements.length} placements, ${this.utilization.toFixed(1)}% utilization`);
    } finally {
      this.isNesting = false;
      this.showNestingProgress = false;
    }
  }


  /**
   * Export to PDF
   */
  async onExportPdf(): Promise<void> {
    if (this.placements.length === 0 && this.sheets.length === 0) {
      alert('Please run nesting first');
      return;
    }

    try {
      // Show progress bar for PDF generation
      this.showPdfProgress = true;
      this.pdfProgress = 0;
      this.pdfCurrentPage = 0;
      this.pdfTotalPages = this.config.productionMode ? this.sheets.length : 1;

      // Create map of files for backend
      const fileMap = new Map<string, File>();
      this.stickers.forEach(sticker => {
        fileMap.set(sticker.id, sticker.file);
      });

      // Prepare sticker data for PDF generation (all dimensions in mm)
      const stickerData = this.stickers.map(s => ({
        id: s.id,
        points: s.simplifiedPath,
        width: s.inputDimensions.width,
        height: s.inputDimensions.height
      }));

      // Call backend API to generate PDF with progress tracking (dimensions in mm)
      const blob = await this.apiService.generatePdf(
        fileMap,
        this.config.productionMode && this.sheets.length > 0 ? this.sheets : this.placements,
        stickerData,
        this.config.sheetWidthMM,
        this.config.sheetHeightMM,
        this.config.productionMode,
        (progress, current, total) => {
          this.pdfProgress = progress;
          this.pdfCurrentPage = current;
          this.pdfTotalPages = total;
        }
      );

      // Download the PDF
      const filename = `sticker-layout-${Date.now()}.pdf`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);

      // Hide progress bar after a short delay
      setTimeout(() => {
        this.showPdfProgress = false;
      }, 1000);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
      this.showPdfProgress = false;
    }
  }

  /**
   * Reset the application
   */
  onReset(): void {
    if (confirm('Are you sure you want to reset? All progress will be lost.')) {
      this.stickers = [];
      this.placements = [];
      this.sheets = [];
      this.quantities = {};
      this.isNesting = false;
      this.isProcessing = false;
      this.currentGeneration = 0;
      this.currentFitness = 0;
      this.utilization = 0;
    }
  }

  /**
   * Handle configuration changes
   */
  onConfigChanged(newConfig: any): void {
    const oldMaxDimensionMM = this.config.maxDimensionMM;
    this.config = { ...this.config, ...newConfig };

    // If max dimension changed and we have stickers, re-scale them
    if (newConfig.maxDimensionMM && oldMaxDimensionMM !== newConfig.maxDimensionMM && this.stickers.length > 0) {
      this.rescaleAllStickers(oldMaxDimensionMM, newConfig.maxDimensionMM);
    }
  }

  /**
   * Re-scale all stickers when max dimension changes
   */
  private rescaleAllStickers(oldMaxMM: number, newMaxMM: number): void {
    const scaleFactor = newMaxMM / oldMaxMM;

    this.stickers.forEach(sticker => {
      // Scale the dimensions
      sticker.inputDimensions.width *= scaleFactor;
      sticker.inputDimensions.height *= scaleFactor;

      // Scale the paths
      sticker.originalPath = sticker.originalPath.map(p => ({
        x: p.x * scaleFactor,
        y: p.y * scaleFactor
      }));
      sticker.simplifiedPath = sticker.simplifiedPath.map(p => ({
        x: p.x * scaleFactor,
        y: p.y * scaleFactor
      }));
      sticker.offsetPath = sticker.offsetPath.map(p => ({
        x: p.x * scaleFactor,
        y: p.y * scaleFactor
      }));
    });

    // Clear existing placements so user needs to re-nest
    this.placements = [];
    this.sheets = [];
    this.utilization = 0;
    this.quantities = {};

    console.log(`Re-scaled ${this.stickers.length} stickers from ${(oldMaxMM / 25.4).toFixed(2)}" to ${(newMaxMM / 25.4).toFixed(2)}" max dimension`);
  }

  /**
   * Handle sticker dimension changes
   */
  onStickerDimensionChange(index: number, dimension: 'width' | 'height', event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = parseFloat(input.value);

    if (value > 0 && !isNaN(value)) {
      this.stickers[index].inputDimensions[dimension] = value;

      // Clear placements when dimensions change so user needs to re-nest
      if (this.placements.length > 0 || this.sheets.length > 0) {
        this.placements = [];
        this.sheets = [];
        this.utilization = 0;
      }
    }
  }

  /**
   * Computed properties for UI state
   */
  get canStartNesting(): boolean {
    return this.stickers.length > 0 && !this.isNesting && !this.isProcessing;
  }

  get canExport(): boolean {
    return this.placements.length > 0 && !this.isNesting;
  }

  get canReset(): boolean {
    return this.stickers.length > 0 || this.placements.length > 0;
  }

  get nestingStatus(): any {
    if (!this.isNesting && this.currentGeneration === 0) {
      return null;
    }

    return {
      generation: this.currentGeneration,
      fitness: this.currentFitness,
      utilization: this.utilization
    };
  }
}
