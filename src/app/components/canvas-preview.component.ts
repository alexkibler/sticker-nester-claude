import {
  Component,
  Input,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnChanges,
  SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { StickerSource, Placement } from '../models';
import { SheetPlacement } from '../services/api.service';

/**
 * CanvasPreviewComponent renders the nesting layout
 *
 * Features:
 * - Real-time preview of sticker placements
 * - Renders sticker images and outlines
 * - Handles transformations (rotation, translation)
 * - Scales to fit viewport
 */
@Component({
  selector: 'app-canvas-preview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="canvas-container">
      <div class="sheets-wrapper" *ngIf="productionMode && sheets.length > 0; else singleSheet">
        <div class="sheet-preview" *ngFor="let sheet of sheets">
          <div class="sheet-label">Sheet {{ sheet.sheetIndex + 1 }}</div>
          <canvas [attr.data-sheet]="sheet.sheetIndex"></canvas>
          <div class="sheet-stats">
            <div>{{ sheet.placements.length }} stickers</div>
            <div>{{ sheet.utilization.toFixed(1) }}%</div>
          </div>
        </div>
      </div>
      <ng-template #singleSheet>
        <canvas #canvas></canvas>
        <div class="stats" *ngIf="placements.length > 0">
          <div>Stickers: {{ placements.length }}</div>
          <div *ngIf="utilization > 0">
            Utilization: {{ utilization.toFixed(1) }}%
          </div>
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    .canvas-container {
      position: relative;
      width: 100%;
      min-height: 600px;
      background-color: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      overflow-x: hidden;
      overflow-y: auto;
      padding: 20px;
    }

    .sheets-wrapper {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
      gap: 20px;
      width: 100%;
    }

    .sheet-preview {
      display: flex;
      flex-direction: column;
      background-color: white;
      border: 2px solid #ddd;
      border-radius: 4px;
      padding: 10px;
    }

    .sheet-label {
      font-weight: 600;
      font-size: 14px;
      color: #333;
      margin-bottom: 8px;
      text-align: center;
    }

    .sheet-stats {
      margin-top: 8px;
      padding: 8px;
      background-color: #f9f9f9;
      border-radius: 4px;
      font-size: 12px;
      text-align: center;
    }

    .sheet-stats div {
      margin: 2px 0;
    }

    canvas {
      display: block;
      max-width: 100%;
      max-height: 400px;
      margin: auto;
      background-color: white;
    }

    .stats {
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(255, 255, 255, 0.9);
      padding: 10px 15px;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      font-size: 14px;
    }

    .stats div {
      margin: 3px 0;
    }

    @media (max-width: 768px) {
      .canvas-container {
        min-height: 400px;
        padding: 15px;
      }

      .sheets-wrapper {
        grid-template-columns: 1fr;
        gap: 15px;
      }
    }

    @media (max-width: 480px) {
      .canvas-container {
        min-height: 300px;
        padding: 10px;
      }

      .sheets-wrapper {
        gap: 10px;
      }

      .sheet-title {
        font-size: 14px;
      }

      .stats {
        font-size: 12px;
        padding: 8px 12px;
      }
    }
  `]
})
export class CanvasPreviewComponent implements AfterViewInit, OnChanges {
  @ViewChild('canvas', { static: false }) canvasRef?: ElementRef<HTMLCanvasElement>;

  @Input() stickers: StickerSource[] = [];
  @Input() placements: Placement[] = [];
  @Input() sheets: SheetPlacement[] = [];
  @Input() sheetWidth: number = 12; // inches
  @Input() sheetHeight: number = 12; // inches
  @Input() utilization: number = 0;
  @Input() productionMode: boolean = false;

  private ctx: CanvasRenderingContext2D | null = null;
  private scale: number = 1;

  ngAfterViewInit(): void {
    setTimeout(() => {
      if (this.productionMode && this.sheets.length > 0) {
        this.renderMultipleSheets();
      } else if (this.canvasRef) {
        const canvas = this.canvasRef.nativeElement;
        this.ctx = canvas.getContext('2d');
        this.setupCanvas();
        this.render();
      }
    }, 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.productionMode && this.sheets.length > 0) {
      setTimeout(() => this.renderMultipleSheets(), 0);
    } else if (this.ctx) {
      this.render();
    } else if (this.canvasRef) {
      const canvas = this.canvasRef.nativeElement;
      this.ctx = canvas.getContext('2d');
      this.setupCanvas();
      this.render();
    }
  }

  private setupCanvas(): void {
    if (!this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    const container = canvas.parentElement!;

    // Set canvas size to match sheet aspect ratio
    const aspectRatio = this.sheetWidth / this.sheetHeight;
    const containerWidth = container.clientWidth - 40;
    const containerHeight = container.clientHeight - 40;

    if (containerWidth / containerHeight > aspectRatio) {
      canvas.height = containerHeight;
      canvas.width = containerHeight * aspectRatio;
    } else {
      canvas.width = containerWidth;
      canvas.height = containerWidth / aspectRatio;
    }

    // Calculate scale: how many pixels per inch
    this.scale = canvas.width / this.sheetWidth;
  }

  private render(): void {
    if (!this.ctx || !this.canvasRef) return;

    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw sheet background
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw sheet border
    this.ctx.strokeStyle = '#cccccc';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    this.drawGrid();

    // Draw placements
    this.placements.forEach(placement => {
      const sticker = this.stickers.find(s => s.id === placement.id);
      if (sticker) {
        this.drawSticker(sticker, placement);
      }
    });
  }

  private drawGrid(): void {
    if (!this.ctx) return;

    this.ctx.strokeStyle = '#eeeeee';
    this.ctx.lineWidth = 1;

    // Draw 1-inch grid
    for (let x = 0; x <= this.sheetWidth; x++) {
      const px = x * this.scale;
      this.ctx.beginPath();
      this.ctx.moveTo(px, 0);
      this.ctx.lineTo(px, this.sheetHeight * this.scale);
      this.ctx.stroke();
    }

    for (let y = 0; y <= this.sheetHeight; y++) {
      const py = y * this.scale;
      this.ctx.beginPath();
      this.ctx.moveTo(0, py);
      this.ctx.lineTo(this.sheetWidth * this.scale, py);
      this.ctx.stroke();
    }
  }

  private renderMultipleSheets(): void {
    const canvases = document.querySelectorAll('[data-sheet]');
    canvases.forEach((canvas, index) => {
      const htmlCanvas = canvas as HTMLCanvasElement;
      const sheet = this.sheets[index];
      if (!sheet) return;

      const ctx = htmlCanvas.getContext('2d');
      if (!ctx) return;

      // Setup canvas size
      const maxWidth = 300;
      const aspectRatio = this.sheetWidth / this.sheetHeight;
      htmlCanvas.width = maxWidth;
      htmlCanvas.height = maxWidth / aspectRatio;

      const scale = htmlCanvas.width / this.sheetWidth;

      // Clear canvas
      ctx.clearRect(0, 0, htmlCanvas.width, htmlCanvas.height);

      // Draw sheet background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, htmlCanvas.width, htmlCanvas.height);

      // Draw sheet border
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, htmlCanvas.width, htmlCanvas.height);

      // Draw grid
      this.drawGridOnContext(ctx, scale);

      // Draw placements
      sheet.placements.forEach(placement => {
        const sticker = this.findStickerById(placement.id);
        if (sticker) {
          this.drawStickerOnContext(ctx, sticker, placement, scale);
        }
      });
    });
  }

  private findStickerById(id: string): StickerSource | undefined {
    // Remove instance suffix (_0, _1, _2, etc.) if present
    const originalId = id.replace(/_\d+$/, '');
    return this.stickers.find(s => s.id === originalId || s.id === id);
  }

  private drawGridOnContext(ctx: CanvasRenderingContext2D, scale: number): void {
    ctx.strokeStyle = '#eeeeee';
    ctx.lineWidth = 1;

    // Draw 1-inch grid
    for (let x = 0; x <= this.sheetWidth; x++) {
      const px = x * scale;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, this.sheetHeight * scale);
      ctx.stroke();
    }

    for (let y = 0; y <= this.sheetHeight; y++) {
      const py = y * scale;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(this.sheetWidth * scale, py);
      ctx.stroke();
    }
  }

  private drawStickerOnContext(
    ctx: CanvasRenderingContext2D,
    sticker: StickerSource,
    placement: Placement,
    scale: number
  ): void {
    // STRICT STATE ISOLATION: Save state before any transformations
    ctx.save();

    // Convert placement coordinates (in inches) to pixels
    const x = placement.x * scale;
    const y = placement.y * scale;
    const width = sticker.inputDimensions.width * scale;
    const height = sticker.inputDimensions.height * scale;

    // Step 1: Translate to placement position (absolute from packer)
    ctx.translate(x, y);

    // Step 2: Handle rotation with center-based pivot
    if (placement.rotation && placement.rotation !== 0) {
      const angleRad = (placement.rotation * Math.PI) / 180;
      const is90DegRotation = Math.abs(Math.abs(placement.rotation) - 90) < 0.1;

      if (is90DegRotation) {
        // For 90-degree rotations: rotate around center of ROTATED bounding box
        // Rotated box dimensions are swapped: height × width
        // Center of rotated box is at (height/2, width/2) from placement origin
        ctx.translate(height / 2, width / 2);
        ctx.rotate(angleRad);

        // Draw image centered using ORIGINAL dimensions
        if (sticker.bitmap) {
          ctx.globalAlpha = 0.8;
          ctx.drawImage(sticker.bitmap, -width / 2, -height / 2, width, height);
          ctx.globalAlpha = 1.0;
        }

        // Draw outline
        if (sticker.simplifiedPath.length > 0) {
          ctx.strokeStyle = '#999999';
          ctx.lineWidth = 1;
          ctx.beginPath();

          const scaledPoints = sticker.simplifiedPath.map(p => ({
            x: (p.x * scale) - width / 2,
            y: (p.y * scale) - height / 2
          }));

          ctx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
          for (let i = 1; i < scaledPoints.length; i++) {
            ctx.lineTo(scaledPoints[i].x, scaledPoints[i].y);
          }
          ctx.closePath();
          ctx.stroke();
        }
      } else {
        // For arbitrary angles: rotate around center normally
        ctx.translate(width / 2, height / 2);
        ctx.rotate(angleRad);

        // Draw image offset by negative half dimensions (no swap for non-90° rotations)
        if (sticker.bitmap) {
          ctx.globalAlpha = 0.8;
          ctx.drawImage(sticker.bitmap, -width / 2, -height / 2, width, height);
          ctx.globalAlpha = 1.0;
        }

        // Draw outline
        if (sticker.simplifiedPath.length > 0) {
          ctx.strokeStyle = '#999999';
          ctx.lineWidth = 1;
          ctx.beginPath();

          const scaledPoints = sticker.simplifiedPath.map(p => ({
            x: (p.x * scale) - width / 2,
            y: (p.y * scale) - height / 2
          }));

          ctx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
          for (let i = 1; i < scaledPoints.length; i++) {
            ctx.lineTo(scaledPoints[i].x, scaledPoints[i].y);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
    } else {
      // No rotation: Draw at origin (0, 0)
      if (sticker.bitmap) {
        ctx.globalAlpha = 0.8;
        ctx.drawImage(sticker.bitmap, 0, 0, width, height);
        ctx.globalAlpha = 1.0;
      }

      // Draw outline (subtle)
      if (sticker.simplifiedPath.length > 0) {
        this.drawPathOnContext(ctx, sticker.simplifiedPath, '#999999', 1, scale);
      }
    }

    // STRICT STATE ISOLATION: Restore state after rendering this sticker
    ctx.restore();
  }

  private drawPathOnContext(
    ctx: CanvasRenderingContext2D,
    points: { x: number; y: number }[],
    color: string,
    lineWidth: number,
    scale: number
  ): void {
    if (points.length === 0) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    // Scale points to canvas
    const scaledPoints = points.map(p => ({
      x: p.x * scale,
      y: p.y * scale
    }));

    ctx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
    for (let i = 1; i < scaledPoints.length; i++) {
      ctx.lineTo(scaledPoints[i].x, scaledPoints[i].y);
    }

    ctx.closePath();
    ctx.stroke();
  }

  private drawSticker(sticker: StickerSource, placement: Placement): void {
    if (!this.ctx) return;

    // STRICT STATE ISOLATION: Save state before any transformations
    this.ctx.save();

    // Convert placement coordinates (in inches) to pixels
    const x = placement.x * this.scale;
    const y = placement.y * this.scale;
    const width = sticker.inputDimensions.width * this.scale;
    const height = sticker.inputDimensions.height * this.scale;

    // Step 1: Translate to placement position (absolute from packer)
    this.ctx.translate(x, y);

    // Step 2: Handle rotation with center-based pivot
    if (placement.rotation && placement.rotation !== 0) {
      const angleRad = (placement.rotation * Math.PI) / 180;
      const is90DegRotation = Math.abs(Math.abs(placement.rotation) - 90) < 0.1;

      if (is90DegRotation) {
        // For 90-degree rotations: rotate around center of ROTATED bounding box
        // Rotated box dimensions are swapped: height × width
        // Center of rotated box is at (height/2, width/2) from placement origin
        this.ctx.translate(height / 2, width / 2);
        this.ctx.rotate(angleRad);

        // Draw image centered using ORIGINAL dimensions
        if (sticker.bitmap) {
          this.ctx.globalAlpha = 0.8;
          this.ctx.drawImage(sticker.bitmap, -width / 2, -height / 2, width, height);
          this.ctx.globalAlpha = 1.0;
        }

        // Draw outline
        if (sticker.simplifiedPath.length > 0) {
          this.ctx.strokeStyle = '#999999';
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();

          const scaledPoints = sticker.simplifiedPath.map(p => ({
            x: (p.x * this.scale) - width / 2,
            y: (p.y * this.scale) - height / 2
          }));

          this.ctx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
          for (let i = 1; i < scaledPoints.length; i++) {
            this.ctx.lineTo(scaledPoints[i].x, scaledPoints[i].y);
          }
          this.ctx.closePath();
          this.ctx.stroke();
        }
      } else {
        // For arbitrary angles: rotate around center normally
        this.ctx.translate(width / 2, height / 2);
        this.ctx.rotate(angleRad);

        // Draw image offset by negative half dimensions (no swap for non-90° rotations)
        if (sticker.bitmap) {
          this.ctx.globalAlpha = 0.8;
          this.ctx.drawImage(sticker.bitmap, -width / 2, -height / 2, width, height);
          this.ctx.globalAlpha = 1.0;
        }

        // Draw outline
        if (sticker.simplifiedPath.length > 0) {
          this.ctx.strokeStyle = '#999999';
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();

          const scaledPoints = sticker.simplifiedPath.map(p => ({
            x: (p.x * this.scale) - width / 2,
            y: (p.y * this.scale) - height / 2
          }));

          this.ctx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
          for (let i = 1; i < scaledPoints.length; i++) {
            this.ctx.lineTo(scaledPoints[i].x, scaledPoints[i].y);
          }
          this.ctx.closePath();
          this.ctx.stroke();
        }
      }
    } else {
      // No rotation: Draw at origin (0, 0)
      if (sticker.bitmap) {
        this.ctx.globalAlpha = 0.8;
        this.ctx.drawImage(sticker.bitmap, 0, 0, width, height);
        this.ctx.globalAlpha = 1.0;
      }

      // Draw outline (subtle)
      if (sticker.simplifiedPath.length > 0) {
        this.drawPath(sticker.simplifiedPath, '#999999', 1);
      }
    }

    // STRICT STATE ISOLATION: Restore state after rendering this sticker
    this.ctx.restore();
  }

  private drawPath(
    points: { x: number; y: number }[],
    color: string,
    lineWidth: number
  ): void {
    if (!this.ctx || points.length === 0) return;

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.beginPath();

    // Scale points to canvas
    const scaledPoints = points.map(p => ({
      x: p.x * this.scale,
      y: p.y * this.scale
    }));

    this.ctx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
    for (let i = 1; i < scaledPoints.length; i++) {
      this.ctx.lineTo(scaledPoints[i].x, scaledPoints[i].y);
    }

    this.ctx.closePath();
    this.ctx.stroke();
  }
}
