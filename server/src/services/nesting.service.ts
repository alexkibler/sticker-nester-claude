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

export interface SheetPlacement {
  sheetIndex: number;
  placements: Placement[];
  utilization: number;
}

export interface MultiSheetResult {
  sheets: SheetPlacement[];
  totalUtilization: number;
  quantities: { [stickerId: string]: number };
}

export class NestingService {
  private geometry = new GeometryService();

  /**
   * Nest stickers across multiple sheets for production runs
   */
  nestStickersMultiSheet(
    stickers: Sticker[],
    sheetWidth: number,
    sheetHeight: number,
    sheetCount: number,
    spacing: number = 0.0625
  ): MultiSheetResult {
    // Calculate total available area
    const singleSheetArea = sheetWidth * sheetHeight;
    const totalArea = singleSheetArea * sheetCount;

    // Calculate average sticker area
    const stickerAreas = stickers.map(s => s.width * s.height);
    const avgStickerArea = stickerAreas.reduce((sum, area) => sum + area, 0) / stickers.length;

    // Estimate how many total stickers we can fit per sheet
    // Use a more aggressive estimate - assume we can fit many more
    const stickersPerSheet = Math.floor(singleSheetArea / (avgStickerArea * 1.5)); // Account for spacing
    const maxStickersTotal = stickersPerSheet * sheetCount;

    // Distribute quantities evenly across sticker types
    const copiesPerSticker = Math.max(1, Math.floor(maxStickersTotal / stickers.length));

    console.log(`Multi-sheet nesting: ${sheetCount} sheets, ${stickers.length} designs`);
    console.log(`Estimated ${stickersPerSheet} per sheet = ${maxStickersTotal} total`);
    console.log(`Creating ${copiesPerSticker} copies of each design`);

    // Create expanded sticker list with copies
    const expandedStickers: Sticker[] = [];
    const quantities: { [stickerId: string]: number } = {};

    stickers.forEach((sticker) => {
      quantities[sticker.id] = copiesPerSticker;
      for (let i = 0; i < copiesPerSticker; i++) {
        expandedStickers.push({
          ...sticker,
          id: `${sticker.id}_copy${i}`,
        });
      }
    });

    // Don't sort - use round-robin distribution for better balance
    const sorted = [...expandedStickers];

    // Nest across multiple sheets using round-robin
    const sheets: SheetPlacement[] = [];

    // Initialize all sheets
    for (let i = 0; i < sheetCount; i++) {
      sheets.push({
        sheetIndex: i,
        placements: [],
        utilization: 0,
      });
    }

    // Track state for each sheet
    const sheetStates = sheets.map(() => ({
      currentX: spacing,
      currentY: spacing,
      rowHeight: 0,
    }));

    // Distribute stickers round-robin across sheets
    let currentSheetIndex = 0;

    for (const sticker of sorted) {
      let placed = false;
      let attempts = 0;

      // Try to place on sheets starting from current, cycling through all sheets
      while (!placed && attempts < sheetCount) {
        const sheet = sheets[currentSheetIndex];
        const state = sheetStates[currentSheetIndex];

        // Try to place at current position
        if (state.currentX + sticker.width + spacing <= sheetWidth) {
          sheet.placements.push({
            id: sticker.id,
            x: state.currentX,
            y: state.currentY,
            rotation: 0,
          });
          state.currentX += sticker.width + spacing;
          state.rowHeight = Math.max(state.rowHeight, sticker.height);
          placed = true;
        } else {
          // Try next row
          state.currentY += state.rowHeight + spacing;
          state.currentX = spacing;
          state.rowHeight = 0;

          if (state.currentY + sticker.height + spacing <= sheetHeight) {
            sheet.placements.push({
              id: sticker.id,
              x: state.currentX,
              y: state.currentY,
              rotation: 0,
            });
            state.currentX += sticker.width + spacing;
            state.rowHeight = sticker.height;
            placed = true;
          }
        }

        if (!placed) {
          // This sheet is full, try next sheet
          currentSheetIndex = (currentSheetIndex + 1) % sheetCount;
          attempts++;
        } else {
          // Successfully placed, move to next sheet for next sticker (round-robin)
          currentSheetIndex = (currentSheetIndex + 1) % sheetCount;
        }
      }

      if (!placed) {
        console.warn(`Could not place sticker ${sticker.id} on any sheet`);
      }
    }

    // Calculate utilization for each sheet
    sheets.forEach(sheet => {
      const usedArea = this.calculateUsedArea(sheet.placements, expandedStickers);
      sheet.utilization = (usedArea / singleSheetArea) * 100;
    });

    // Calculate total utilization
    const totalUsedArea = sheets.reduce((sum, sheet) => {
      return sum + this.calculateUsedArea(sheet.placements, expandedStickers);
    }, 0);

    const totalUtilization = (totalUsedArea / totalArea) * 100;

    console.log(`Total utilization: ${totalUtilization.toFixed(1)}%`);
    sheets.forEach(sheet => {
      console.log(`  Sheet ${sheet.sheetIndex + 1}: ${sheet.placements.length} stickers, ${sheet.utilization.toFixed(1)}%`);
    });

    return {
      sheets,
      totalUtilization,
      quantities,
    };
  }

  /**
   * Helper to calculate used area from placements
   */
  private calculateUsedArea(placements: Placement[], stickers: Sticker[]): number {
    return placements.reduce((sum, p) => {
      const sticker = stickers.find(s => s.id === p.id);
      return sum + (sticker ? sticker.width * sticker.height : 0);
    }, 0);
  }

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
