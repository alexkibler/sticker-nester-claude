import { Point } from './image.service';
import { MaxRectsPacker, IRectangle } from 'maxrects-packer';

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
  /**
   * Nest stickers across multiple sheets using MaxRects algorithm with Oversubscribe and Sort strategy
   * Generates a balanced candidate pool by cycling through all stickers until reaching 115% of target area
   */
  nestStickersMultiSheet(
    stickers: Sticker[],
    sheetWidth: number,
    sheetHeight: number,
    pageCount: number,
    spacing: number = 0.0625
  ): MultiSheetResult {
    console.log(`Multi-sheet nesting: ${stickers.length} unique designs across ${pageCount} pages`);

    // Handle edge cases
    if (stickers.length === 0 || pageCount === 0) {
      return {
        sheets: [],
        totalUtilization: 0,
        quantities: {},
      };
    }

    // Step 1: Calculate target area with 115% buffer (Oversubscribe strategy)
    const targetArea = pageCount * sheetWidth * sheetHeight;
    const targetWithBuffer = targetArea * 1.15;
    console.log(`Target area: ${targetArea.toFixed(2)}, with 115% buffer: ${targetWithBuffer.toFixed(2)}`);

    // Step 2: Generate candidate pool by cycling through stickers (balanced distribution)
    interface PackingItem extends IRectangle {
      stickerId: string; // Original sticker ID
      instanceId: string; // Unique ID for this instance
      width: number;
      height: number;
      x: number;
      y: number;
    }

    const allItems: PackingItem[] = [];
    let currentArea = 0;
    let stickerIndex = 0;
    let instanceCounter: { [stickerId: string]: number } = {};

    // Initialize instance counters
    stickers.forEach(sticker => {
      instanceCounter[sticker.id] = 0;
    });

    // Cycle through stickers in round-robin fashion until we reach target area
    while (currentArea < targetWithBuffer) {
      const sticker = stickers[stickerIndex % stickers.length];
      const itemArea = sticker.width * sticker.height;

      const instanceId = `${sticker.id}_${instanceCounter[sticker.id]}`;
      instanceCounter[sticker.id]++;

      allItems.push({
        stickerId: sticker.id,
        instanceId: instanceId,
        width: sticker.width,
        height: sticker.height,
        x: 0,
        y: 0,
      });

      currentArea += itemArea;
      stickerIndex++;
    }

    console.log(`Generated candidate pool: ${allItems.length} items, total area: ${currentArea.toFixed(2)}`);

    // Step 2: Sort by height descending (Big Rocks First)
    // This ensures large items are placed first and small items backfill gaps
    allItems.sort((a, b) => {
      const heightDiff = b.height - a.height;
      if (Math.abs(heightDiff) > 0.001) return heightDiff;
      // If heights are equal, sort by area
      return (b.width * b.height) - (a.width * a.height);
    });

    console.log('Items sorted by height (descending)');

    // Step 3: Create exactly pageCount packers (one per sheet)
    // Pack items into these fixed sheets to maximize utilization
    const packers: MaxRectsPacker<PackingItem>[] = [];
    for (let i = 0; i < pageCount; i++) {
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

    // Pack items using greedy fill strategy - fill each sheet completely before moving to next
    let packedCount = 0;

    for (const item of allItems) {
      let packed = false;

      // Try to pack in each available sheet until we find one with space
      for (let i = 0; i < pageCount && !packed; i++) {
        const packer = packers[i];
        const beforeCount = packer.bins.length > 0 ? packer.bins[0].rects.length : 0;

        packer.add(item);

        const afterCount = packer.bins.length > 0 ? packer.bins[0].rects.length : 0;

        // Check if item was successfully added
        if (afterCount > beforeCount) {
          packed = true;
          packedCount++;
          break;
        }
      }

      if (!packed) {
        console.log(`Warning: Could not pack item ${item.instanceId}`);
      }
    }

    console.log(`Packing complete: ${packedCount}/${allItems.length} items packed into ${pageCount} sheets`);

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

    // Calculate quantities from packed results
    const quantities: { [stickerId: string]: number } = {};
    sheets.forEach(sheet => {
      sheet.placements.forEach(placement => {
        const item = allItems.find(i => i.instanceId === placement.id);
        if (item) {
          quantities[item.stickerId] = (quantities[item.stickerId] || 0) + 1;
        }
      });
    });

    console.log('Packed quantities:', quantities);

    return {
      sheets,
      totalUtilization,
      quantities,
    };
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
