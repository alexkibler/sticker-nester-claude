import { Injectable } from '@angular/core';
import { StickerSource, Placement, Point } from '../models';
import { UnitConversionService } from './unit-conversion.service';
import { jsPDF } from 'jspdf';

/**
 * PDFService generates production-ready PDF files using jsPDF (browser-compatible)
 *
 * Key features:
 * - Embeds high-resolution raster images at correct physical size
 * - Draws precise cut lines from high-res vector paths
 * - Handles unit conversion from internal coordinates to PDF points
 * - Outputs at 300 DPI for print production
 *
 * As specified in section 6 of the architectural specification
 */
@Injectable({
  providedIn: 'root'
})
export class PdfService {
  constructor(private unitConversion: UnitConversionService) {}

  /**
   * Generate a PDF from nesting results
   *
   * @param stickers - Array of sticker sources
   * @param placements - Placement information from nesting
   * @param sheetWidth - Sheet width in inches
   * @param sheetHeight - Sheet height in inches
   * @returns Promise resolving to a Blob containing the PDF
   */
  async generatePdf(
    stickers: StickerSource[],
    placements: Placement[],
    sheetWidth: number,
    sheetHeight: number
  ): Promise<Blob> {
    try {
      // Create PDF with custom page size (in mm)
      const widthMm = sheetWidth * 25.4;
      const heightMm = sheetHeight * 25.4;

      const doc = new jsPDF({
        orientation: widthMm > heightMm ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [widthMm, heightMm]
      });

      // Draw each placed sticker
      for (const placement of placements) {
        const sticker = stickers.find(s => s.id === placement.id);
        if (!sticker) continue;

        await this.drawSticker(doc, sticker, placement);
      }

      // Generate blob
      const blob = doc.output('blob');
      return blob;
    } catch (error) {
      console.error('Error generating PDF:', error);
      throw error;
    }
  }

  /**
   * Draw a single sticker on the PDF
   */
  private async drawSticker(
    doc: jsPDF,
    sticker: StickerSource,
    placement: Placement
  ): Promise<void> {
    try {
      // Convert placement coordinates to mm
      const xMm = placement.x * 25.4;
      const yMm = placement.y * 25.4;

      // Save state
      doc.saveGraphicsState();

      // Draw the image if available
      if (sticker.bitmap) {
        await this.drawStickerImage(doc, sticker, xMm, yMm, placement.rotation);
      }

      // Draw the cut line
      this.drawCutLine(doc, sticker, xMm, yMm, placement.rotation);

      // Restore state
      doc.restoreGraphicsState();
    } catch (error) {
      console.error('Error drawing sticker:', error);
    }
  }

  /**
   * Draw the sticker image
   */
  private async drawStickerImage(
    doc: jsPDF,
    sticker: StickerSource,
    xMm: number,
    yMm: number,
    rotation: number
  ): Promise<void> {
    try {
      // Convert bitmap to data URL
      const canvas = document.createElement('canvas');
      canvas.width = sticker.bitmap!.width;
      canvas.height = sticker.bitmap!.height;

      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(sticker.bitmap!, 0, 0);

      const dataUrl = canvas.toDataURL('image/png');

      // Calculate target size in mm
      const widthMm = sticker.inputDimensions.width * 25.4;
      const heightMm = sticker.inputDimensions.height * 25.4;

      // Apply rotation and embed image
      if (rotation !== 0) {
        // Calculate center point for rotation
        const centerX = xMm + widthMm / 2;
        const centerY = yMm + heightMm / 2;

        // Translate to center, rotate, translate back
        doc.saveGraphicsState();

        // Apply rotation (jsPDF uses degrees)
        // Note: jsPDF rotation is counterclockwise
        const angleRad = (-rotation * Math.PI) / 180;

        // Transform matrix for rotation around point
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);

        // Move origin to rotation point
        doc.setCurrentTransformationMatrix([
          cos,
          sin,
          -sin,
          cos,
          centerX - (cos * centerX - sin * centerY),
          centerY - (sin * centerX + cos * centerY)
        ]);
      }

      // Embed image
      doc.addImage(
        dataUrl,
        'PNG',
        xMm - (rotation !== 0 ? widthMm / 2 : 0),
        yMm - (rotation !== 0 ? heightMm / 2 : 0),
        widthMm,
        heightMm
      );

      if (rotation !== 0) {
        doc.restoreGraphicsState();
      }
    } catch (error) {
      console.error('Error drawing sticker image:', error);
    }
  }

  /**
   * Draw the cut line (vector path)
   */
  private drawCutLine(
    doc: jsPDF,
    sticker: StickerSource,
    xMm: number,
    yMm: number,
    rotation: number
  ): void {
    if (sticker.originalPath.length === 0) return;

    // Use the high-res path for final output
    const path = sticker.originalPath;

    // Calculate scale factor from pixel coordinates to physical dimensions
    const bitmap = sticker.bitmap;
    if (!bitmap) return;

    const scaleX = (sticker.inputDimensions.width * 25.4) / bitmap.width;
    const scaleY = (sticker.inputDimensions.height * 25.4) / bitmap.height;

    // Set stroke color and width for cut lines
    doc.setDrawColor(255, 0, 0); // Red cut lines
    doc.setLineWidth(0.1);

    // Transform points based on rotation
    const transformedPoints = path.map(p => {
      let px = p.x * scaleX;
      let py = p.y * scaleY;

      if (rotation !== 0) {
        const angleRad = (rotation * Math.PI) / 180;
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);

        // Rotate around center
        const centerX = (sticker.inputDimensions.width * 25.4) / 2;
        const centerY = (sticker.inputDimensions.height * 25.4) / 2;

        const translatedX = px - centerX;
        const translatedY = py - centerY;

        px = translatedX * cos - translatedY * sin + centerX;
        py = translatedX * sin + translatedY * cos + centerY;
      }

      return {
        x: xMm + px,
        y: yMm + py
      };
    });

    // Draw path
    if (transformedPoints.length > 0) {
      doc.lines(
        transformedPoints.map((p, i) => {
          if (i === transformedPoints.length - 1) {
            return [
              transformedPoints[0].x - p.x,
              transformedPoints[0].y - p.y
            ];
          }
          return [
            transformedPoints[i + 1].x - p.x,
            transformedPoints[i + 1].y - p.y
          ];
        }),
        transformedPoints[0].x,
        transformedPoints[0].y,
        [1, 1],
        'S',
        false
      );
    }
  }

  /**
   * Generate a PDF with just the layout preview (no cut lines)
   */
  async generatePreviewPdf(
    stickers: StickerSource[],
    placements: Placement[],
    sheetWidth: number,
    sheetHeight: number
  ): Promise<Blob> {
    try {
      const widthMm = sheetWidth * 25.4;
      const heightMm = sheetHeight * 25.4;

      const doc = new jsPDF({
        orientation: widthMm > heightMm ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [widthMm, heightMm]
      });

      // Draw sheet border
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.rect(0, 0, widthMm, heightMm);

      // Draw placement rectangles
      placements.forEach(placement => {
        const sticker = stickers.find(s => s.id === placement.id);
        if (!sticker) return;

        const xMm = placement.x * 25.4;
        const yMm = placement.y * 25.4;
        const wMm = sticker.inputDimensions.width * 25.4;
        const hMm = sticker.inputDimensions.height * 25.4;

        doc.setDrawColor(0, 0, 255);
        doc.rect(xMm, yMm, wMm, hMm);
      });

      const blob = doc.output('blob');
      return blob;
    } catch (error) {
      console.error('Error generating preview PDF:', error);
      throw error;
    }
  }

  /**
   * Download a blob as a file
   */
  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();

    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}
