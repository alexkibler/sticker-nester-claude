import { Point } from './image.service';
import { GeometryService } from './geometry.service';
import { MaxRectsPacker, Rectangle, IRectangle } from 'maxrects-packer';

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
   * Nest stickers across multiple sheets for production runs using MaxRects algorithm
   */
  nestStickersMultiSheet(
    stickers: Sticker[],
    sheetWidth: number,
    sheetHeight: number,
    quantities: { [stickerId: string]: number },
    spacing: number = 0.0625,
    maxSheets: number = 5
  ): MultiSheetResult {
    console.log(`Multi-sheet nesting: ${stickers.length} unique designs`);
    console.log('Requested quantities:', quantities);

    // Step 1: Create flat array of all items based on user quantities
    interface PackingItem extends IRectangle {
      stickerId: string; // Original sticker ID
      instanceId: string; // Unique ID for this instance
      width: number;
      height: number;
      x: number;
      y: number;
    }

    const allItems: PackingItem[] = [];
    let totalItems = 0;

    stickers.forEach((sticker) => {
      const quantity = quantities[sticker.id] || 0;
      totalItems += quantity;

      for (let i = 0; i < quantity; i++) {
        allItems.push({
          stickerId: sticker.id,
          instanceId: `${sticker.id}_${i}`,
          width: sticker.width,
          height: sticker.height,
          x: 0,
          y: 0,
        });
      }
    });

    console.log(`Total items to pack: ${totalItems}`);

    // Step 2: Sort by height descending (Big Rocks First)
    // This ensures large items are placed first and small items backfill gaps
    allItems.sort((a, b) => {
      const heightDiff = b.height - a.height;
      if (Math.abs(heightDiff) > 0.001) return heightDiff;
      // If heights are equal, sort by area
      return (b.width * b.height) - (a.width * a.height);
    });

    console.log('Items sorted by height (descending)');

    // Step 3: Create exactly maxSheets packers (one per sheet)
    // Pack items into these fixed sheets to maximize utilization
    const packers: MaxRectsPacker<PackingItem>[] = [];
    for (let i = 0; i < maxSheets; i++) {
      packers.push(new MaxRectsPacker<PackingItem>(
        sheetWidth,
        sheetHeight,
        spacing,
        {
          smart: true,
          pot: false,
          square: false,
          allowRotation: true,
          border: spacing,
        }
      ));
    }

    // Pack items using round-robin strategy for better distribution
    let packedCount = 0;
    let currentPackerIndex = 0;

    for (const item of allItems) {
      let packed = false;

      // Try to pack in the current packer first
      for (let attempts = 0; attempts < maxSheets && !packed; attempts++) {
        const packer = packers[currentPackerIndex];
        packer.add(item);

        // Check if item was successfully packed
        if (packer.bins.length > 0 && packer.bins[0].rects.some(r => (r as any).instanceId === item.instanceId)) {
          packed = true;
          packedCount++;
        } else {
          // Item didn't fit, try next packer
          currentPackerIndex = (currentPackerIndex + 1) % maxSheets;
        }
      }

      // Move to next packer for round-robin
      if (packed) {
        currentPackerIndex = (currentPackerIndex + 1) % maxSheets;
      }
    }

    console.log(`Packing complete: ${packedCount}/${totalItems} items packed into ${maxSheets} sheets`);

    // Step 4: Extract placements from each packer's first bin
    const sheets: SheetPlacement[] = [];
    const singleSheetArea = sheetWidth * sheetHeight;

    packers.forEach((packer, index) => {
      if (packer.bins.length === 0 || packer.bins[0].rects.length === 0) {
        // Empty sheet
        sheets.push({
          sheetIndex: index,
          placements: [],
          utilization: 0,
        });
        console.log(`  Sheet ${index + 1}: 0 items, 0.0% utilization`);
        return;
      }

      const bin = packer.bins[0];
      const placements: Placement[] = bin.rects.map((rect) => {
        const item = rect as PackingItem;
        return {
          id: item.instanceId,
          x: rect.x,
          y: rect.y,
          // Convert rotation: maxrects-packer uses boolean 'rot' for 90-degree rotation
          rotation: rect.rot ? 90 : 0,
        };
      });

      // Calculate utilization
      const usedArea = bin.rects.reduce((sum, rect) => {
        return sum + (rect.width * rect.height);
      }, 0);
      const utilization = (usedArea / singleSheetArea) * 100;

      sheets.push({
        sheetIndex: index,
        placements,
        utilization,
      });

      console.log(`  Sheet ${index + 1}: ${placements.length} items, ${utilization.toFixed(1)}% utilization`);
    });

    // Calculate total utilization across all sheets
    const totalArea = singleSheetArea * sheets.length;
    const totalUsedArea = sheets.reduce((sum, sheet) => {
      return sum + sheet.placements.reduce((itemSum, p) => {
        // Find the original item dimensions
        const item = allItems.find(i => i.instanceId === p.id);
        return itemSum + (item ? item.width * item.height : 0);
      }, 0);
    }, 0);
    const totalUtilization = (totalUsedArea / totalArea) * 100;

    console.log(`Total utilization: ${totalUtilization.toFixed(1)}%`);

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
   * Nest stickers onto a single sheet using MaxRects algorithm
   */
  nestStickers(
    stickers: Sticker[],
    sheetWidth: number,
    sheetHeight: number,
    spacing: number = 0.0625
  ): NestingResult {
    // Use MaxRects for single sheet as well
    interface PackingItem extends IRectangle {
      stickerId: string;
      width: number;
      height: number;
      x: number;
      y: number;
    }

    // Sort by height descending (Big Rocks First)
    const sorted = [...stickers].sort((a, b) => {
      const heightDiff = b.height - a.height;
      if (Math.abs(heightDiff) > 0.001) return heightDiff;
      return (b.width * b.height) - (a.width * a.height);
    });

    // Create packer for single sheet
    const packer = new MaxRectsPacker<PackingItem>(
      sheetWidth,
      sheetHeight,
      spacing,  // padding between items
      {
        smart: true,
        pot: false,
        square: false,
        allowRotation: true,
        border: spacing,  // edge spacing
      }
    );

    // Add all items
    sorted.forEach(sticker => {
      packer.add({
        stickerId: sticker.id,
        width: sticker.width,
        height: sticker.height,
        x: 0,
        y: 0,
      });
    });

    // Extract placements from first bin only (single sheet mode)
    const placements: Placement[] = [];
    if (packer.bins.length > 0) {
      const bin = packer.bins[0];
      placements.push(...bin.rects.map((rect) => {
        const item = rect as PackingItem;
        return {
          id: item.stickerId,
          x: rect.x,
          y: rect.y,
          rotation: rect.rot ? 90 : 0,
        };
      }));
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
