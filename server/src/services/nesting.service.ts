import { Point } from './image.service';
import { GeometryService } from './geometry.service';

export interface Sticker {
  id: string;
  points: Point[];
  width: number;
  height: number;
}

export interface Placement {
  id: string;
  x: number;
  y: number;
  rotation: number;
}

export interface NestingResult {
  placements: Placement[];
  utilization: number;
  fitness: number;
}

export class NestingService {
  private geometry = new GeometryService();

  /**
   * Nest stickers onto a sheet using a simple greedy algorithm
   * (Simplified version - full genetic algorithm can be added later)
   */
  nestStickers(
    stickers: Sticker[],
    sheetWidth: number,
    sheetHeight: number,
    spacing: number = 0.0625
  ): NestingResult {
    const placements: Placement[] = [];

    // Sort by area (largest first)
    const sorted = [...stickers].sort((a, b) => {
      const areaA = a.width * a.height;
      const areaB = b.width * b.height;
      return areaB - areaA;
    });

    let currentX = spacing;
    let currentY = spacing;
    let rowHeight = 0;

    for (const sticker of sorted) {
      // Try to place at current position
      if (currentX + sticker.width + spacing <= sheetWidth) {
        placements.push({
          id: sticker.id,
          x: currentX,
          y: currentY,
          rotation: 0
        });

        currentX += sticker.width + spacing;
        rowHeight = Math.max(rowHeight, sticker.height);
      } else {
        // Move to next row
        currentY += rowHeight + spacing;
        currentX = spacing;
        rowHeight = 0;

        // Check if fits in new row
        if (currentY + sticker.height + spacing <= sheetHeight) {
          placements.push({
            id: sticker.id,
            x: currentX,
            y: currentY,
            rotation: 0
          });

          currentX += sticker.width + spacing;
          rowHeight = sticker.height;
        }
      }
    }

    // Calculate utilization
    const usedArea = stickers.reduce((sum, s) => {
      const placed = placements.find(p => p.id === s.id);
      return sum + (placed ? s.width * s.height : 0);
    }, 0);

    const sheetArea = sheetWidth * sheetHeight;
    const utilization = (usedArea / sheetArea) * 100;

    return {
      placements,
      utilization,
      fitness: usedArea
    };
  }
}
