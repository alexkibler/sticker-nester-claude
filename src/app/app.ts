import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

// Components
import { UploadDropzoneComponent } from './components/upload-dropzone.component';
import { CanvasPreviewComponent } from './components/canvas-preview.component';
import { ControlPanelComponent } from './components/control-panel.component';

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
    ControlPanelComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  // State signals
  protected readonly title = signal('Sticker Nester');
  stickers: StickerSource[] = [];
  placements: Placement[] = [];
  isNesting = false;
  isProcessing = false;
  currentGeneration = 0;
  currentFitness = 0;
  utilization = 0;

  // Configuration
  config = {
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

    try {
      // Process all files via backend API
      const processedImages = await this.apiService.processImages(files);

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
    } catch (error) {
      console.error('Error processing files:', error);
      alert('Error processing files. Please try again.');
    } finally {
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

    try {
      // Call backend API for nesting
      const response = await this.apiService.nestStickers({
        stickers: this.stickers.map(s => ({
          id: s.id,
          points: s.simplifiedPath,
          width: s.inputDimensions.width,
          height: s.inputDimensions.height
        })),
        sheetWidth: this.config.sheetWidth,
        sheetHeight: this.config.sheetHeight,
        spacing: this.config.spacing
      });

      this.placements = response.placements;
      this.utilization = response.utilization;
      this.currentFitness = response.fitness;
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
    if (this.placements.length === 0) {
      alert('Please run nesting first');
      return;
    }

    try {
      // Create map of files for backend
      const fileMap = new Map<string, File>();
      this.stickers.forEach(sticker => {
        fileMap.set(sticker.id, sticker.file);
      });

      // Call backend API to generate PDF
      const blob = await this.apiService.generatePdf(
        fileMap,
        this.placements,
        this.config.sheetWidth,
        this.config.sheetHeight
      );

      // Download the PDF
      const filename = `sticker-layout-${Date.now()}.pdf`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  }

  /**
   * Reset the application
   */
  onReset(): void {
    if (confirm('Are you sure you want to reset? All progress will be lost.')) {
      this.stickers = [];
      this.placements = [];
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
