import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

// Components
import { UploadDropzoneComponent } from './components/upload-dropzone.component';
import { CanvasPreviewComponent } from './components/canvas-preview.component';
import { ControlPanelComponent } from './components/control-panel.component';

// Services
import {
  ImageAnalysisService,
  GeometryService,
  UnitConversionService,
  WorkerService,
  PdfService
} from './services';

// Models
import {
  StickerSource,
  NestingRequest,
  NestingResponse,
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
    private geometry: GeometryService,
    private unitConversion: UnitConversionService,
    private workerService: WorkerService,
    private pdfService: PdfService
  ) {}

  ngOnInit(): void {
    // Subscribe to nesting progress
    this.subscriptions.add(
      this.workerService.getProgress().subscribe({
        next: (response: NestingResponse) => {
          this.handleNestingProgress(response);
        },
        error: (error) => {
          console.error('Nesting error:', error);
          this.isNesting = false;
        }
      })
    );

    // Subscribe to errors
    this.subscriptions.add(
      this.workerService.getErrors().subscribe({
        next: (error: string) => {
          console.error('Worker error:', error);
          alert(`Nesting error: ${error}`);
          this.isNesting = false;
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.workerService.terminate();
  }

  /**
   * Handle file uploads
   */
  async onFilesSelected(files: File[]): Promise<void> {
    this.isProcessing = true;

    try {
      for (const file of files) {
        await this.processFile(file);
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
   * Process a single file through the entire pipeline
   */
  private async processFile(file: File): Promise<void> {
    try {
      // Create sticker object
      const sticker: StickerSource = {
        id: uuidv4(),
        file,
        bitmap: null,
        inputDimensions: {
          width: 2, // Default size
          height: 2,
          unit: 'in'
        },
        originalPath: [],
        simplifiedPath: [],
        offsetPath: [],
        margin: this.config.margin,
        isProcessed: false
      };

      // Load image bitmap for preview
      sticker.bitmap = await this.imageAnalysis.loadImageBitmap(file);

      // Calculate actual dimensions (maintain aspect ratio)
      const aspectRatio = sticker.bitmap.width / sticker.bitmap.height;
      sticker.inputDimensions.height = sticker.inputDimensions.width / aspectRatio;

      // Trace image to vector
      const paths = await this.imageAnalysis.traceImageFile(file);
      const largestPath = this.imageAnalysis.getLargestPath(paths);

      if (largestPath.length === 0) {
        console.warn('Could not trace path for', file.name);
        return;
      }

      // Store original high-res path
      sticker.originalPath = largestPath;

      // Simplify path for nesting (low-res)
      sticker.simplifiedPath = this.geometry.simplifyPath(
        largestPath,
        2.0,
        true
      );

      // Apply offset for margin/bleed
      if (this.config.margin > 0) {
        const offsetDistance = this.unitConversion.toCanvasPixels(
          this.config.margin,
          'in'
        );
        sticker.offsetPath = await this.geometry.offsetPolygon(
          sticker.simplifiedPath,
          offsetDistance,
          'round'
        );
      } else {
        sticker.offsetPath = [...sticker.simplifiedPath];
      }

      sticker.isProcessed = true;
      this.stickers.push(sticker);
    } catch (error) {
      console.error('Error processing file:', file.name, error);
      throw error;
    }
  }

  /**
   * Start nesting algorithm
   */
  onStartNesting(): void {
    if (this.stickers.length === 0) {
      alert('Please upload some stickers first');
      return;
    }

    this.isNesting = true;
    this.placements = [];

    // Prepare nesting request
    const request: NestingRequest = {
      bin: {
        width: this.config.sheetWidth,
        height: this.config.sheetHeight
      },
      shapes: this.stickers.map(s => ({
        id: s.id,
        points: s.simplifiedPath
      })),
      config: {
        rotations: this.config.rotations,
        populationSize: this.config.populationSize,
        mutationRate: this.config.mutationRate,
        spacing: this.config.spacing
      }
    };

    // Start worker
    this.workerService.startNesting(request);
  }

  /**
   * Stop nesting algorithm
   */
  onStopNesting(): void {
    this.workerService.stopNesting();
    this.isNesting = false;
  }

  /**
   * Handle nesting progress updates
   */
  private handleNestingProgress(response: NestingResponse): void {
    this.currentGeneration = response.generation;
    this.currentFitness = response.fitness;
    this.placements = response.placements;
    this.utilization = response.binUtilization || 0;

    // If complete, stop nesting
    if (response.generation >= 1000) {
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
      const blob = await this.pdfService.generatePdf(
        this.stickers,
        this.placements,
        this.config.sheetWidth,
        this.config.sheetHeight
      );

      const filename = `sticker-layout-${Date.now()}.pdf`;
      this.pdfService.downloadBlob(blob, filename);
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
