import { Point } from './image.service';
import { MaxRectsPacker, IRectangle } from 'maxrects-packer';
import {
  PolygonPacker,
  PackablePolygon,
  PolygonPlacement,
  PolygonPackingResult,
} from './polygon-packing.service';
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
  message?: string; // Optional informational message (e.g., when fewer sheets filled than requested)
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

    // Step 1: Calculate target area with dynamic buffer (Oversubscribe strategy)
    // Use smaller buffer for large jobs to prevent excessive candidate pools
    const targetArea = pageCount * sheetWidth * sheetHeight;
    const bufferMultiplier = pageCount <= 5 ? 1.15 : pageCount <= 20 ? 1.10 : 1.05;
    const targetWithBuffer = targetArea * bufferMultiplier;
    console.log(`Target area: ${targetArea.toFixed(2)}, with ${(bufferMultiplier * 100 - 100).toFixed(0)}% buffer: ${targetWithBuffer.toFixed(2)}`);

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

    // Calculate reasonable cap based on expected items needed
    // Estimate: average sticker area, target area, and add buffer for safety
    const avgStickerArea = stickers.reduce((sum, s) => sum + (s.width * s.height), 0) / stickers.length;
    const estimatedItemsNeeded = Math.ceil(targetWithBuffer / avgStickerArea);

    // Cap at 3x estimated need (allows for packing inefficiency), with absolute max of 5000
    const calculatedCap = Math.min(estimatedItemsNeeded * 3, 5000);
    const MAX_CANDIDATE_ITEMS = Math.max(calculatedCap, 500); // At least 500 items

    console.log(`Average sticker area: ${avgStickerArea.toFixed(2)} sq in, estimated items needed: ${estimatedItemsNeeded}, cap: ${MAX_CANDIDATE_ITEMS}`);

    // Cycle through stickers in round-robin fashion until we reach target area OR hit item cap
    while (currentArea < targetWithBuffer && allItems.length < MAX_CANDIDATE_ITEMS) {
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

      // Log progress for large jobs
      if (allItems.length % 500 === 0) {
        console.log(`  Generated ${allItems.length} candidates so far...`);
      }
    }

    const cappedNote = allItems.length >= MAX_CANDIDATE_ITEMS ? ' (capped)' : '';
    console.log(`Generated candidate pool: ${allItems.length} items${cappedNote}, total area: ${currentArea.toFixed(2)}`);

    // Step 2: Sort by height descending (Big Rocks First)
    // This ensures large items are placed first and small items backfill gaps
    allItems.sort((a, b) => {
      const heightDiff = b.height - a.height;
      if (Math.abs(heightDiff) > 0.001) return heightDiff;
      // If heights are equal, sort by area
      return (b.width * b.height) - (a.width * a.height);
    });

    console.log(`Items sorted by height (descending). Starting packing...`);

    // Step 3: Use SINGLE packer to pack all items optimally, then distribute bins to sheets
    // This ensures collision-free packing since the packer creates new bins when items don't fit
    const packStartTime = Date.now();
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
    const packDuration = ((Date.now() - packStartTime) / 1000).toFixed(2);

    console.log(`Packing complete in ${packDuration}s: Created ${packer.bins.length} bins for ${allItems.length} items`);

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

    // Step 5: Gap-filling optimization pass
    // Try to fit remaining unpacked items into empty spaces on each sheet
    const packedInstanceIds = new Set<string>();
    sheets.forEach(sheet => {
      sheet.placements.forEach(placement => {
        packedInstanceIds.add(placement.id);
      });
    });

    const unpackedItems = allItems.filter(item => !packedInstanceIds.has(item.instanceId));

    if (unpackedItems.length > 0) {
      console.log(`\nGap-filling optimization: Attempting to fit ${unpackedItems.length} remaining items into empty spaces`);

      // Sort unpacked items by area (smallest first) - small items are more likely to fit in gaps
      unpackedItems.sort((a, b) => {
        const areaA = a.width * a.height;
        const areaB = b.width * b.height;
        return areaA - areaB;
      });

      const gapFillingResults = this.fillGaps(sheets, unpackedItems, allItems, sheetWidth, sheetHeight, stickers, spacing);

      // Update sheets with gap-filled results
      sheets.splice(0, sheets.length, ...gapFillingResults.sheets);

      console.log(`Gap-filling complete: Added ${gapFillingResults.totalItemsAdded} items across all sheets`);
    }

    // Recalculate total utilization after gap-filling
    const totalAreaAfterGapFill = singleSheetArea * sheets.length;
    const totalUsedAreaAfterGapFill = sheets.reduce((sum, sheet) => {
      return sum + sheet.placements.reduce((itemSum, p) => {
        const item = allItems.find(i => i.instanceId === p.id);
        return itemSum + (item ? item.originalWidth * item.originalHeight : 0);
      }, 0);
    }, 0);
    const totalUtilizationAfterGapFill = (totalUsedAreaAfterGapFill / totalAreaAfterGapFill) * 100;

    console.log(`Total utilization after gap-filling: ${totalUtilizationAfterGapFill.toFixed(1)}%`);

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

    // Step 6: Final filtering to remove empty sheets
    const finalSheets = sheets.filter(sheet => sheet.placements.length > 0);
    if (finalSheets.length < sheets.length) {
      console.log(`Removed ${sheets.length - finalSheets.length} empty sheets from the final result.`);
    }

    console.log('Final packed quantities:', quantities);

    return {
      sheets: finalSheets,
      totalUtilization: totalUtilizationAfterGapFill,
      quantities,
    };
  }

  /**
   * Gap-filling optimization: Try to fit unpacked items into remaining empty space on each sheet
   * This is a post-processing step that runs after the main packing algorithm
   */
  private fillGaps(
    sheets: SheetPlacement[],
    unpackedItems: any[],
    allItems: any[],
    sheetWidth: number,
    sheetHeight: number,
    originalStickers: Sticker[],
    spacing: number
  ): { sheets: SheetPlacement[]; totalItemsAdded: number } {
    let totalItemsAdded = 0;
    const updatedSheets: SheetPlacement[] = [];

    // Process each sheet individually
    for (const sheet of sheets) {
      let itemsAddedToSheet = 0;
      const remainingUnpacked = [...unpackedItems];
      const currentPlacements = [...sheet.placements];

      // Try to add each unpacked item to this sheet
      for (let i = 0; i < remainingUnpacked.length; i++) {
        const candidateItem = remainingUnpacked[i];

        // Create a temporary packer to test if this item can fit
        const testPacker = new MaxRectsPacker<any>(
          sheetWidth,
          sheetHeight,
          0,
          {
            smart: true,
            pot: false,
            square: false,
            allowRotation: true,
            border: 0,
          }
        );

        // Add all currently placed items to reserve their space
        currentPlacements.forEach(placement => {
          const placedItem = allItems.find(item => item.instanceId === placement.id);
          if (placedItem) {
            testPacker.add({
              ...placedItem,
              x: placement.x,
              y: placement.y,
            });
          }
        });

        // Try to add the candidate item
        testPacker.add(candidateItem);

        // Check if the item was successfully packed (should still be in first bin)
        if (testPacker.bins.length === 1 && testPacker.bins[0].rects.length === currentPlacements.length + 1) {
          // Item fit! Add it to current placements
          const packedRect = testPacker.bins[0].rects[testPacker.bins[0].rects.length - 1];
          currentPlacements.push({
            id: candidateItem.instanceId,
            x: packedRect.x,
            y: packedRect.y,
            rotation: packedRect.rot ? 90 : 0,
          });

          // Remove this item from unpacked pool
          remainingUnpacked.splice(i, 1);
          i--; // Adjust index since we removed an item

          itemsAddedToSheet++;
          totalItemsAdded++;
        }
      }

      // Recalculate utilization for this sheet
      const usedArea = currentPlacements.reduce((sum, placement) => {
        const item = allItems.find(i => i.instanceId === placement.id);
        return sum + (item ? item.originalWidth * item.originalHeight : 0);
      }, 0);
      const sheetArea = sheetWidth * sheetHeight;
      const utilization = (usedArea / sheetArea) * 100;

      updatedSheets.push({
        sheetIndex: sheet.sheetIndex,
        placements: currentPlacements,
        utilization,
      });

      if (itemsAddedToSheet > 0) {
        console.log(`  Sheet ${sheet.sheetIndex + 1}: Added ${itemsAddedToSheet} items via gap-filling (${utilization.toFixed(1)}% utilization)`);
      }
    }

    return {
      sheets: updatedSheets,
      totalItemsAdded,
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

  /**
   * Nest stickers onto a single sheet using POLYGON packing (rasterization overlay algorithm)
   * This uses the actual polygon shapes instead of bounding rectangles
   */
  nestStickersPolygon(
    stickers: Sticker[],
    sheetWidth: number,
    sheetHeight: number,
    spacing: number = 0.0625,
    cellsPerInch: number = 100,
    stepSize: number = 0.05
  ): NestingResult {
    console.log(`Polygon packing (single sheet): ${stickers.length} stickers`);

    // CRITICAL: Convert dimensions from millimeters to inches
    // All dimensions in the system are in mm, but PolygonPacker expects inches
    const MM_PER_INCH = 25.4;
    const sheetWidthInches = sheetWidth / MM_PER_INCH;
    const sheetHeightInches = sheetHeight / MM_PER_INCH;
    const spacingInches = spacing / MM_PER_INCH;

    console.log(`Sheet: ${sheetWidth.toFixed(1)}mm × ${sheetHeight.toFixed(1)}mm = ${sheetWidthInches.toFixed(1)}" × ${sheetHeightInches.toFixed(1)}"`);

    // Convert stickers to packable polygons (convert dimensions to inches)
    const geometryService = new GeometryService();
    const polygons: PackablePolygon[] = stickers.map(sticker => {
      const widthInches = sticker.width / MM_PER_INCH;
      const heightInches = sticker.height / MM_PER_INCH;
      const area = widthInches * heightInches;

      // Convert polygon points from mm to inches
      const pointsInches = sticker.points.map(p => ({
        x: p.x / MM_PER_INCH,
        y: p.y / MM_PER_INCH,
      }));

      return {
        id: sticker.id,
        points: pointsInches,
        width: widthInches,
        height: heightInches,
        area,
      };
    });

    // Create packer and pack polygons (all dimensions now in inches)
    const packer = new PolygonPacker(sheetWidthInches, sheetHeightInches, spacingInches, cellsPerInch, stepSize);
    const result = packer.pack(polygons);

    // Convert polygon placements to standard placements (convert positions back to mm for consistency)
    const placements: Placement[] = result.placements.map(p => ({
      id: p.id,
      x: p.x * MM_PER_INCH, // Convert back to mm
      y: p.y * MM_PER_INCH, // Convert back to mm
      rotation: p.rotation,
    }));

    // Calculate fitness (total area placed in mm²)
    const fitness = result.placements.reduce((sum, p) => {
      const sticker = stickers.find(s => s.id === p.id);
      return sum + (sticker ? sticker.width * sticker.height : 0);
    }, 0);

    console.log(`Polygon packing result: ${placements.length}/${stickers.length} placed, ${result.utilization.toFixed(1)}% utilization`);

    return {
      placements,
      utilization: result.utilization,
      fitness,
    };
  }

  /**
   * Nest stickers across multiple sheets using POLYGON packing with Oversubscribe and Sort strategy
   * Uses actual polygon shapes instead of bounding rectangles
   */
  nestStickersMultiSheetPolygon(
    stickers: Sticker[],
    sheetWidth: number,
    sheetHeight: number,
    pageCount: number,
    spacing: number = 0.0625,
    cellsPerInch: number = 100,
    stepSize: number = 0.05
  ): MultiSheetResult {
    console.log(`Polygon multi-sheet packing: ${stickers.length} unique designs across ${pageCount} pages`);

    // Handle edge cases
    if (stickers.length === 0 || pageCount === 0) {
      return {
        sheets: [],
        totalUtilization: 0,
        quantities: {},
      };
    }

    // CRITICAL: Convert dimensions from millimeters to inches
    // All dimensions in the system are in mm, but PolygonPacker expects inches
    const MM_PER_INCH = 25.4;
    const sheetWidthInches = sheetWidth / MM_PER_INCH;
    const sheetHeightInches = sheetHeight / MM_PER_INCH;
    const spacingInches = spacing / MM_PER_INCH;

    console.log(`Sheet: ${sheetWidth.toFixed(1)}mm × ${sheetHeight.toFixed(1)}mm = ${sheetWidthInches.toFixed(1)}" × ${sheetHeightInches.toFixed(1)}"`);

    // Step 1: Calculate target area with buffer (Oversubscribe strategy)
    // Keep area calculation in mm² for now (will be converted below)
    const targetArea = pageCount * sheetWidth * sheetHeight;
    const bufferMultiplier = pageCount <= 5 ? 1.15 : pageCount <= 20 ? 1.10 : 1.05;
    const targetWithBuffer = targetArea * bufferMultiplier;
    console.log(`Target area: ${targetArea.toFixed(2)} mm², with ${(bufferMultiplier * 100 - 100).toFixed(0)}% buffer: ${targetWithBuffer.toFixed(2)} mm²`);

    // Step 2: Generate candidate pool by cycling through stickers
    const geometryService = new GeometryService();
    interface PolygonInstance extends PackablePolygon {
      stickerId: string;
      instanceId: string;
    }

    const allPolygons: PolygonInstance[] = [];
    let currentArea = 0; // in mm²
    let stickerIndex = 0;
    let instanceCounter: { [stickerId: string]: number } = {};

    // Initialize instance counters
    stickers.forEach(sticker => {
      instanceCounter[sticker.id] = 0;
    });

    // Calculate reasonable cap
    const avgStickerArea = stickers.reduce((sum, s) => sum + (s.width * s.height), 0) / stickers.length;
    const estimatedItemsNeeded = Math.ceil(targetWithBuffer / avgStickerArea);
    const calculatedCap = Math.min(estimatedItemsNeeded * 3, 5000);
    const MAX_CANDIDATE_ITEMS = Math.max(calculatedCap, 500);

    console.log(`Average sticker area: ${avgStickerArea.toFixed(2)} mm², estimated items needed: ${estimatedItemsNeeded}, cap: ${MAX_CANDIDATE_ITEMS}`);

    // Cycle through stickers in round-robin fashion
    while (currentArea < targetWithBuffer && allPolygons.length < MAX_CANDIDATE_ITEMS) {
      const sticker = stickers[stickerIndex % stickers.length];
      const itemArea = sticker.width * sticker.height; // in mm²

      const instanceId = `${sticker.id}_${instanceCounter[sticker.id]}`;
      instanceCounter[sticker.id]++;

      // Convert dimensions to inches for polygon packing
      const widthInches = sticker.width / MM_PER_INCH;
      const heightInches = sticker.height / MM_PER_INCH;
      const areaInches = widthInches * heightInches;

      // Convert polygon points from mm to inches
      const pointsInches = sticker.points.map(p => ({
        x: p.x / MM_PER_INCH,
        y: p.y / MM_PER_INCH,
      }));

      allPolygons.push({
        id: instanceId,
        stickerId: sticker.id,
        instanceId: instanceId,
        points: pointsInches, // in inches
        width: widthInches,   // in inches
        height: heightInches, // in inches
        area: areaInches,     // in square inches
      });

      currentArea += itemArea; // Keep tracking in mm² for candidate pool
      stickerIndex++;

      if (allPolygons.length % 500 === 0) {
        console.log(`  Generated ${allPolygons.length} candidates so far...`);
      }
    }

    const cappedNote = allPolygons.length >= MAX_CANDIDATE_ITEMS ? ' (capped)' : '';
    console.log(`Generated candidate pool: ${allPolygons.length} items${cappedNote}, total area: ${currentArea.toFixed(2)} mm²`);

    // Step 3: Pack onto multiple sheets
    const sheets: SheetPlacement[] = [];
    let remainingPolygons = [...allPolygons];
    const singleSheetArea = sheetWidth * sheetHeight; // in mm²

    for (let sheetIndex = 0; sheetIndex < pageCount && remainingPolygons.length > 0; sheetIndex++) {
      console.log(`\nPacking sheet ${sheetIndex + 1}/${pageCount}...`);

      // Create packer for this sheet (dimensions in inches)
      const packer = new PolygonPacker(sheetWidthInches, sheetHeightInches, spacingInches, cellsPerInch, stepSize);
      const result = packer.pack(remainingPolygons);

      // Convert to placements (convert positions back to mm)
      const placements: Placement[] = result.placements.map(p => ({
        id: p.id,
        x: p.x * MM_PER_INCH, // Convert back to mm
        y: p.y * MM_PER_INCH, // Convert back to mm
        rotation: p.rotation,
      }));

      // Calculate utilization using actual polygon areas (in inches²)
      const usedAreaInches = result.placements.reduce((sum, p) => {
        const poly = allPolygons.find(poly => poly.instanceId === p.id);
        return sum + (poly ? poly.area : 0);
      }, 0);
      const sheetAreaInches = sheetWidthInches * sheetHeightInches;
      const utilization = (usedAreaInches / sheetAreaInches) * 100;

      sheets.push({
        sheetIndex,
        placements,
        utilization,
      });

      console.log(`  Sheet ${sheetIndex + 1}: ${placements.length} items, ${utilization.toFixed(1)}% utilization`);

      // Remove placed polygons from remaining pool
      const placedIds = new Set(result.placements.map(p => p.id));
      remainingPolygons = remainingPolygons.filter(p => !placedIds.has(p.instanceId));

      console.log(`  Remaining unpacked items: ${remainingPolygons.length}`);
    }

    // Calculate total utilization (using inches² for consistency)
    const totalAreaInches = sheetWidthInches * sheetHeightInches * sheets.length;
    const totalUsedAreaInches = sheets.reduce((sum, sheet) => {
      return sum + sheet.placements.reduce((itemSum, p) => {
        const poly = allPolygons.find(poly => poly.instanceId === p.id);
        return itemSum + (poly ? poly.area : 0); // area is in inches²
      }, 0);
    }, 0);
    const totalUtilization = (totalUsedAreaInches / totalAreaInches) * 100;

    console.log(`Total utilization: ${totalUtilization.toFixed(1)}%`);

    // Calculate quantities
    const quantities: { [stickerId: string]: number } = {};
    sheets.forEach(sheet => {
      sheet.placements.forEach(placement => {
        const poly = allPolygons.find(p => p.instanceId === placement.id);
        if (poly) {
          quantities[poly.stickerId] = (quantities[poly.stickerId] || 0) + 1;
        }
      });
    });

    // Filter out empty sheets
    const finalSheets = sheets.filter(sheet => sheet.placements.length > 0);
    if (finalSheets.length < sheets.length) {
      console.log(`Removed ${sheets.length - finalSheets.length} empty sheets from final result.`);
    }

    console.log('Final packed quantities:', quantities);

    return {
      sheets: finalSheets,
      totalUtilization,
      quantities,
    };
  }
}
