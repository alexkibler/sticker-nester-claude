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
  Placement
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

  // Configuration
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

  private subscriptions = new Subscription();

  constructor(
    private imageAnalysis: ImageAnalysisService,
    private apiService: ApiService
  ) {}

  ngOnInit(): void {
    // No subscriptions needed for backend API approach
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /**
   * Handle file uploads
   */
  async onFilesSelected(files: File[]): Promise<void> {
    this.isProcessing = true;
    this.showUploadProgress = true;
    this.uploadProgress = 0;

    try {
      // Process all files via backend API with progress tracking
      const processedImages = await this.apiService.processImages(files, (progress) => {
        this.uploadProgress = progress;
      });

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
            unit: 'in'
          },
          originalPath: processed.path,
          simplifiedPath: processed.path,
          offsetPath: processed.path,
          margin: this.config.margin,
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
      // Prepare request payload
      const requestPayload: any = {
        stickers: this.stickers.map(s => ({
          id: s.id,
          points: s.simplifiedPath,
          width: s.inputDimensions.width,
          height: s.inputDimensions.height
        })),
        sheetWidth: this.config.sheetWidth,
        sheetHeight: this.config.sheetHeight,
        spacing: this.config.spacing,
        productionMode: this.config.productionMode,
        sheetCount: this.config.sheetCount
      };

      // Add quantities for production mode
      if (this.config.productionMode) {
        requestPayload.quantities = {};

        // Calculate total available area
        const totalSheetArea = this.config.sheetWidth * this.config.sheetHeight * this.config.sheetCount;

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
    } catch (error) {
      console.error('Nesting error:', error);
      alert('Error running nesting algorithm. Please try again.');
    } finally {
      this.isNesting = false;
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

      // Prepare sticker data for PDF generation
      const stickerData = this.stickers.map(s => ({
        id: s.id,
        points: s.simplifiedPath,
        width: s.inputDimensions.width,
        height: s.inputDimensions.height
      }));

      // Call backend API to generate PDF with progress tracking
      const blob = await this.apiService.generatePdf(
        fileMap,
        this.config.productionMode && this.sheets.length > 0 ? this.sheets : this.placements,
        stickerData,
        this.config.sheetWidth,
        this.config.sheetHeight,
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
    this.config = { ...this.config, ...newConfig };
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
