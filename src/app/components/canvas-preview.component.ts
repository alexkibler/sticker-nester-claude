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
      <canvas #canvas></canvas>
      <div class="stats" *ngIf="placements.length > 0">
        <div>Stickers: {{ placements.length }}</div>
        <div *ngIf="utilization > 0">
          Utilization: {{ utilization.toFixed(1) }}%
        </div>
      </div>
    </div>
  `,
  styles: [`
    .canvas-container {
      position: relative;
      width: 100%;
      height: 600px;
      background-color: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      overflow: hidden;
    }

    canvas {
      display: block;
      max-width: 100%;
      max-height: 100%;
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
  `]
})
export class CanvasPreviewComponent implements AfterViewInit, OnChanges {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() stickers: StickerSource[] = [];
  @Input() placements: Placement[] = [];
  @Input() sheetWidth: number = 12; // inches
  @Input() sheetHeight: number = 12; // inches
  @Input() utilization: number = 0;

  private ctx: CanvasRenderingContext2D | null = null;
  private scale: number = 1;

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d');
    this.setupCanvas();
    this.render();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.ctx) {
      this.render();
    }
  }

  private setupCanvas(): void {
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
    if (!this.ctx) return;

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

  private drawSticker(sticker: StickerSource, placement: Placement): void {
    if (!this.ctx) return;

    this.ctx.save();

    // Convert placement coordinates (in inches) to pixels
    const x = placement.x * this.scale;
    const y = placement.y * this.scale;

    // Translate to position
    this.ctx.translate(x, y);

    // Rotate
    const angleRad = (placement.rotation * Math.PI) / 180;
    this.ctx.rotate(angleRad);

    // Draw image if available
    if (sticker.bitmap) {
      const width = sticker.inputDimensions.width * this.scale;
      const height = sticker.inputDimensions.height * this.scale;

      this.ctx.globalAlpha = 0.8;
      this.ctx.drawImage(sticker.bitmap, 0, 0, width, height);
      this.ctx.globalAlpha = 1.0;
    }

    // Draw outline
    if (sticker.simplifiedPath.length > 0) {
      this.drawPath(sticker.simplifiedPath, '#4CAF50', 2);
    }

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
