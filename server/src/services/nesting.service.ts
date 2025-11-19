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
      width: number;      // Inflated width (includes spacing)
      height: number;     // Inflated height (includes spacing)
      originalWidth: number;  // Original width (for utilization calc)
      originalHeight: number; // Original height (for utilization calc)
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

      // IMPORTANT: Inflate dimensions to include spacing for proper collision detection
      // This ensures items maintain minimum spacing when packed
      allItems.push({
        stickerId: sticker.id,
        instanceId: instanceId,
        width: sticker.width + spacing,  // Add spacing to width
        height: sticker.height + spacing, // Add spacing to height
        originalWidth: sticker.width,     // Store original dimensions
        originalHeight: sticker.height,   // Store original dimensions
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

    // Step 3: Use SINGLE packer to pack all items optimally, then distribute bins to sheets
    // This ensures collision-free packing since the packer creates new bins when items don't fit
    const packer = new MaxRectsPacker<PackingItem>(
      sheetWidth,
      sheetHeight,
      0, // No padding - we handle spacing via inflated dimensions
      {
        smart: true,
        pot: false,
        square: false,
        allowRotation: true,
        border: 0, // No border - items already include spacing buffer
      }
    );

    // Add all items at once - packer will create bins as needed
    packer.addArray(allItems);

    console.log(`Packing complete: Packer created ${packer.bins.length} bins for ${allItems.length} items`);

    // If we got more bins than requested sheets, we'll only use the first pageCount bins
    if (packer.bins.length > pageCount) {
      const itemsInExtraBins = packer.bins.slice(pageCount).reduce((sum, bin) => sum + bin.rects.length, 0);
      console.log(`Note: Packer created ${packer.bins.length} bins but only ${pageCount} sheets requested. ${itemsInExtraBins} items will not be included.`);
    }

    // Step 4: Extract placements from the packer's bins (up to pageCount sheets)
    const sheets: SheetPlacement[] = [];
    const singleSheetArea = sheetWidth * sheetHeight;

    // Take up to pageCount bins from the packer
    const binsToUse = Math.min(packer.bins.length, pageCount);

    for (let index = 0; index < binsToUse; index++) {
      const bin = packer.bins[index];

      if (!bin || bin.rects.length === 0) {
        // Empty sheet
        sheets.push({
          sheetIndex: index,
          placements: [],
          utilization: 0,
        });
        console.log(`  Sheet ${index + 1}: 0 items, 0.0% utilization`);
        continue;
      }

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

      // Calculate utilization using ORIGINAL dimensions (not inflated)
      const usedArea = bin.rects.reduce((sum, rect) => {
        const item = rect as PackingItem;
        return sum + (item.originalWidth * item.originalHeight);
      }, 0);
      const utilization = (usedArea / singleSheetArea) * 100;

      sheets.push({
        sheetIndex: index,
        placements,
        utilization,
      });

      console.log(`  Sheet ${index + 1}: ${placements.length} items, ${utilization.toFixed(1)}% utilization`);
    }

    // Fill remaining sheets with empty sheets if we got fewer bins than requested
    for (let index = binsToUse; index < pageCount; index++) {
      sheets.push({
        sheetIndex: index,
        placements: [],
        utilization: 0,
      });
      console.log(`  Sheet ${index + 1}: 0 items, 0.0% utilization (no items fit)`);
    }

    // Calculate total utilization across all sheets using ORIGINAL dimensions
    const totalArea = singleSheetArea * sheets.length;
    const totalUsedArea = sheets.reduce((sum, sheet) => {
      return sum + sheet.placements.reduce((itemSum, p) => {
        // Find the original item dimensions (not inflated)
        const item = allItems.find(i => i.instanceId === p.id);
        return itemSum + (item ? item.originalWidth * item.originalHeight : 0);
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
      width: number;      // Inflated width (includes spacing)
      height: number;     // Inflated height (includes spacing)
      originalWidth: number;  // Original width (for utilization calc)
      originalHeight: number; // Original height (for utilization calc)
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
    // Note: No padding/border because we inflate item dimensions to include spacing
    const packer = new MaxRectsPacker<PackingItem>(
      sheetWidth,
      sheetHeight,
      0,  // No padding - we handle spacing via inflated dimensions
      {
        smart: true,
        pot: false,
        square: false,
        allowRotation: true,
        border: 0,  // No border - items already include spacing buffer
      }
    );

    // Add all items with inflated dimensions
    sorted.forEach(sticker => {
      packer.add({
        stickerId: sticker.id,
        width: sticker.width + spacing,   // Inflate width
        height: sticker.height + spacing, // Inflate height
        originalWidth: sticker.width,     // Store original
        originalHeight: sticker.height,   // Store original
        x: 0,
        y: 0,
      });
    });

    // Extract placements from first bin only (single sheet mode)
    const placements: Placement[] = [];
    const placedItems: PackingItem[] = [];
    if (packer.bins.length > 0) {
      const bin = packer.bins[0];
      placements.push(...bin.rects.map((rect) => {
        const item = rect as PackingItem;
        placedItems.push(item);
        return {
          id: item.stickerId,
          x: rect.x,
          y: rect.y,
          rotation: rect.rot ? 90 : 0,
        };
      }));
    }

    // Calculate utilization using ORIGINAL dimensions (not inflated)
    const usedArea = placedItems.reduce((sum, item) => {
      return sum + (item.originalWidth * item.originalHeight);
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
