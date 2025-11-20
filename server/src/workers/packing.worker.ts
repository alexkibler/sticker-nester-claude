/**
 * Worker thread for CPU-intensive polygon packing operations
 * This prevents blocking the main Node.js event loop during long-running packing
 */
import { parentPort, workerData } from 'worker_threads';
import { Point } from '../services/image.service';
import {
  PolygonPacker,
  PackablePolygon,
  estimateSpaceRequirements
} from '../services/polygon-packing.service';
import {
  BottomLeftPacker,
  MultiSheetPolygonPacker,
  PackablePolygon as PackablePolygonV2,
  PackingConfig
} from '../services/polygon-packing-v2.service';
import {
  GravityNester,
  MultiSheetNester,
  NestablePolygon
} from '../services/polygon-nesting.service';
import {
  NFPNester,
  MultiSheetNFPNester,
  NestablePolygon as NFPPolygon
} from '../services/nfp-nesting.service';

export interface PackingWorkerData {
  type: 'single-sheet' | 'multi-sheet';
  stickers: Array<{
    id: string;
    points: Point[];
    width: number;
    height: number;
  }>;
  sheetWidth: number;
  sheetHeight: number;
  spacing: number;
  cellsPerInch: number;
  stepSize: number;
  rotations: number[];
  pageCount?: number; // For multi-sheet
  packAllItems?: boolean; // For multi-sheet
  useV2Algorithm?: boolean; // Use Bottom-Left algorithm (deprecated)
  useV3Algorithm?: boolean; // Use gravity-based nesting (deprecated)
  useNFP?: boolean; // Use No-Fit Polygon nesting (NEW - default: true)
}

export interface PackingWorkerProgress {
  type: 'progress';
  message: string;
  currentSheet?: number;
  totalSheets?: number;
  itemsPlaced?: number;
  totalItems?: number;
  percentComplete?: number;
  // Real-time placement data
  placement?: {
    sheetIndex: number;
    id: string;
    x: number;
    y: number;
    rotation: number;
  };
}

export interface PackingWorkerResult {
  type: 'result';
  result: any; // NestingResult or MultiSheetResult
}

export interface PackingWorkerError {
  type: 'error';
  error: string;
}

export type PackingWorkerMessage = PackingWorkerProgress | PackingWorkerResult | PackingWorkerError;

// Main worker execution
if (parentPort) {
  const data = workerData as PackingWorkerData;

  (async () => {
    try {
      if (data.type === 'single-sheet') {
        await performSingleSheetPacking(data);
      } else {
        await performMultiSheetPacking(data);
      }
      // Don't call process.exit() - let the worker end naturally
      // The parent will terminate it after receiving the result message
    } catch (error: any) {
      sendMessage({
        type: 'error',
        error: error.message || 'Unknown error in packing worker'
      });
      process.exit(1);
    }
  })();
}

function sendMessage(message: PackingWorkerMessage) {
  if (parentPort) {
    parentPort.postMessage(message);
  }
}

async function performSingleSheetPacking(data: PackingWorkerData) {
  const { stickers, sheetWidth, sheetHeight, spacing, cellsPerInch, stepSize, rotations, useV2Algorithm, useV3Algorithm, useNFP = true } = data;

  const algorithm = useNFP ? 'NFP (No-Fit Polygon)' : useV3Algorithm ? 'V3 (Gravity)' : useV2Algorithm ? 'V2 (Bottom-Left)' : 'V1 (Grid)';
  sendMessage({
    type: 'progress',
    message: `Starting polygon packing (${algorithm})...`,
    percentComplete: 0
  });

  // Convert dimensions from mm to inches
  const MM_PER_INCH = 25.4;
  const sheetWidthInches = sheetWidth / MM_PER_INCH;
  const sheetHeightInches = sheetHeight / MM_PER_INCH;
  const spacingInches = spacing / MM_PER_INCH;

  // Convert stickers to packable polygons
  const polygons: PackablePolygon[] = stickers.map(sticker => {
    const widthInches = sticker.width / MM_PER_INCH;
    const heightInches = sticker.height / MM_PER_INCH;
    const area = widthInches * heightInches;

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

  sendMessage({
    type: 'progress',
    message: 'Packing items...',
    percentComplete: 25
  });

  let result: any;

  if (useNFP) {
    // Use NFP algorithm (No-Fit Polygon - true nesting)
    const nester = new NFPNester(
      sheetWidthInches,
      sheetHeightInches,
      spacingInches,
      rotations
    );
    result = await nester.nest(polygons);
  } else if (useV3Algorithm) {
    // Use new V3 algorithm (Gravity-based true nesting)
    const nester = new GravityNester(
      sheetWidthInches,
      sheetHeightInches,
      spacingInches,
      rotations
    );
    result = await nester.nest(polygons);
  } else if (useV2Algorithm) {
    // Use new V2 algorithm (Bottom-Left, no rasterization)
    const config: PackingConfig = {
      sheetWidth: sheetWidthInches,
      sheetHeight: sheetHeightInches,
      spacing: spacingInches,
      rotations,
      progressCallback: (progress) => {
        if (progress.status === 'trying') {
          sendMessage({
            type: 'progress',
            message: `Trying to place ${progress.itemId}...`,
            itemsPlaced: progress.current,
            totalItems: progress.total,
            percentComplete: 25 + Math.floor((progress.current / progress.total) * 50)
          });
        } else if (progress.status === 'placed' && progress.placement) {
          sendMessage({
            type: 'progress',
            message: `Placed ${progress.itemId}`,
            itemsPlaced: progress.current,
            totalItems: progress.total,
            percentComplete: 25 + Math.floor((progress.current / progress.total) * 50),
            placement: {
              sheetIndex: 0,
              id: progress.placement.id,
              x: progress.placement.x * MM_PER_INCH,
              y: progress.placement.y * MM_PER_INCH,
              rotation: progress.placement.rotation
            }
          });
        }
      }
    };

    const packer = new BottomLeftPacker(config);
    result = await packer.pack(polygons);
  } else {
    // Use old V1 algorithm (grid rasterization)
    const packer = new PolygonPacker(
      sheetWidthInches,
      sheetHeightInches,
      spacingInches,
      cellsPerInch,
      stepSize,
      rotations,
      (progress) => {
        // Send real-time placement updates
        if (progress.status === 'trying') {
          sendMessage({
            type: 'progress',
            message: `Trying to place ${progress.itemId}...`,
            itemsPlaced: progress.current,
            totalItems: progress.total,
            percentComplete: 25 + Math.floor((progress.current / progress.total) * 50)
          });
        } else if (progress.status === 'placed' && progress.placement) {
          sendMessage({
            type: 'progress',
            message: `Placed ${progress.itemId}`,
            itemsPlaced: progress.current,
            totalItems: progress.total,
            percentComplete: 25 + Math.floor((progress.current / progress.total) * 50),
            placement: {
              sheetIndex: 0,
              id: progress.placement.id,
              x: progress.placement.x * MM_PER_INCH,
              y: progress.placement.y * MM_PER_INCH,
              rotation: progress.placement.rotation
            }
          });
        }
      }
    );
    result = await packer.pack(polygons);
  }

  sendMessage({
    type: 'progress',
    message: 'Converting results...',
    percentComplete: 75
  });

  // Convert placements back to mm
  const placements = result.placements.map((p: any) => ({
    id: p.id,
    x: p.x * MM_PER_INCH,
    y: p.y * MM_PER_INCH,
    rotation: p.rotation,
  }));

  // Calculate fitness
  const fitness = result.placements.reduce((sum: number, p: any) => {
    const sticker = stickers.find(s => s.id === p.id);
    return sum + (sticker ? sticker.width * sticker.height : 0);
  }, 0);

  sendMessage({
    type: 'progress',
    message: 'Complete!',
    percentComplete: 100
  });

  sendMessage({
    type: 'result',
    result: {
      placements,
      utilization: result.utilization,
      fitness,
    }
  });
}

async function performMultiSheetPacking(data: PackingWorkerData) {
  const {
    stickers,
    sheetWidth,
    sheetHeight,
    pageCount = 1,
    spacing,
    cellsPerInch,
    stepSize,
    rotations,
    packAllItems = false,  // EXPLICIT DEFAULT HERE TOO
    useV2Algorithm,
    useV3Algorithm,
    useNFP = true  // NFP is now default
  } = data;

  // DEBUG LOGGING
  console.log(`\n========== WORKER DEBUG ==========`);
  console.log(`packAllItems from data: ${data.packAllItems}`);
  console.log(`packAllItems after destructure: ${packAllItems}`);
  console.log(`useNFP: ${useNFP}`);
  console.log(`useV3Algorithm: ${useV3Algorithm}`);
  console.log(`pageCount: ${pageCount}`);
  console.log(`spacing: ${spacing}`);
  console.log(`==================================\n`);

  const algorithm = useNFP ? 'NFP (No-Fit Polygon)' : useV3Algorithm ? 'V3 (Gravity)' : useV2Algorithm ? 'V2 (Bottom-Left)' : 'V1 (Grid)';
  const mode = packAllItems ? 'PACK ALL ITEMS (auto-expand)' : 'FIXED PAGES';
  sendMessage({
    type: 'progress',
    message: `Starting multi-sheet polygon packing (${algorithm}): ${mode}`,
    totalItems: stickers.length,
    itemsPlaced: 0,
    percentComplete: 0
  });

  // Convert dimensions from mm to inches
  const MM_PER_INCH = 25.4;
  const sheetWidthInches = sheetWidth / MM_PER_INCH;
  const sheetHeightInches = sheetHeight / MM_PER_INCH;
  const spacingInches = spacing / MM_PER_INCH;

  // Convert stickers to packable polygons
  const polygons: PackablePolygon[] = stickers.map(sticker => {
    const widthInches = sticker.width / MM_PER_INCH;
    const heightInches = sticker.height / MM_PER_INCH;
    const areaInches = widthInches * heightInches;

    const pointsInches = sticker.points.map(p => ({
      x: p.x / MM_PER_INCH,
      y: p.y / MM_PER_INCH,
    }));

    return {
      id: sticker.id,
      points: pointsInches,
      width: widthInches,
      height: heightInches,
      area: areaInches,
    };
  });

  // Use NFP algorithm (No-Fit Polygon - true nesting)
  if (useNFP) {
    sendMessage({
      type: 'progress',
      message: 'Using No-Fit Polygon nesting...',
      percentComplete: 5
    });

    const result = await MultiSheetNFPNester.nestMultiSheet(
      polygons,
      pageCount,
      sheetWidthInches,
      sheetHeightInches,
      spacingInches,
      rotations,
      packAllItems
    );

    // Convert back to mm
    const sheetsInMM = result.sheets.map(sheet => ({
      ...sheet,
      placements: sheet.placements.map(p => ({
        id: p.id,
        x: p.x * MM_PER_INCH,
        y: p.y * MM_PER_INCH,
        rotation: p.rotation
      }))
    }));

    sendMessage({
      type: 'progress',
      message: 'Complete!',
      percentComplete: 100
    });

    sendMessage({
      type: 'result',
      result: {
        sheets: sheetsInMM,
        totalUtilization: result.totalUtilization,
        quantities: result.quantities,
        message: result.message
      }
    });

    return; // Exit early - NFP algorithm complete
  }

  // Use V3 algorithm (true nesting with gravity)
  if (useV3Algorithm) {
    sendMessage({
      type: 'progress',
      message: 'Using gravity-based nesting...',
      percentComplete: 5
    });

    const result = await MultiSheetNester.nestMultiSheet(
      polygons,
      pageCount,
      sheetWidthInches,
      sheetHeightInches,
      spacingInches,
      rotations,
      packAllItems
    );

    // Convert back to mm
    const sheetsInMM = result.sheets.map(sheet => ({
      ...sheet,
      placements: sheet.placements.map(p => ({
        id: p.id,
        x: p.x * MM_PER_INCH,
        y: p.y * MM_PER_INCH,
        rotation: p.rotation
      }))
    }));

    sendMessage({
      type: 'progress',
      message: 'Complete!',
      percentComplete: 100
    });

    sendMessage({
      type: 'result',
      result: {
        sheets: sheetsInMM,
        totalUtilization: result.totalUtilization,
        quantities: result.quantities,
        message: result.message
      }
    });

    return; // Exit early - V3 algorithm complete
  }

  // Use V2 algorithm (Bottom-Left multi-sheet)
  if (useV2Algorithm) {
    sendMessage({
      type: 'progress',
      message: 'Using Bottom-Left algorithm...',
      percentComplete: 5
    });

    const config: PackingConfig = {
      sheetWidth: sheetWidthInches,
      sheetHeight: sheetHeightInches,
      spacing: spacingInches,
      rotations,
      progressCallback: (progress) => {
        if (progress.status === 'placed' && progress.placement) {
          sendMessage({
            type: 'progress',
            message: progress.message,
            percentComplete: 10 + Math.floor(Math.random() * 70), // Rough progress
            placement: {
              sheetIndex: 0, // Will be determined by multi-sheet packer
              id: progress.placement.id,
              x: progress.placement.x * MM_PER_INCH,
              y: progress.placement.y * MM_PER_INCH,
              rotation: progress.placement.rotation
            }
          });
        }
      }
    };

    const result = await MultiSheetPolygonPacker.packMultiSheet(
      polygons,
      pageCount,
      config,
      packAllItems
    );

    // Convert back to mm
    const sheetsInMM = result.sheets.map(sheet => ({
      ...sheet,
      placements: sheet.placements.map(p => ({
        id: p.id,
        x: p.x * MM_PER_INCH,
        y: p.y * MM_PER_INCH,
        rotation: p.rotation
      }))
    }));

    sendMessage({
      type: 'progress',
      message: 'Complete!',
      percentComplete: 100
    });

    sendMessage({
      type: 'result',
      result: {
        sheets: sheetsInMM,
        totalUtilization: result.totalUtilization,
        quantities: result.quantities,
        message: result.message
      }
    });

    return; // Exit early - V2 algorithm complete
  }

  // V1 algorithm (grid rasterization) - original logic below
  // Estimate space requirements
  const estimate = estimateSpaceRequirements(
    polygons,
    sheetWidthInches,
    sheetHeightInches,
    pageCount,
    spacingInches
  );

  sendMessage({
    type: 'progress',
    message: `Estimated ${estimate.minimumPagesNeeded} pages needed`,
    percentComplete: 5
  });

  // Fail fast for fixed-pages mode
  if (!packAllItems && !estimate.canFitInRequestedPages) {
    throw new Error(
      estimate.warning ||
      `Insufficient space: ${stickers.length} items need ~${estimate.minimumPagesNeeded} pages (requested ${pageCount})`
    );
  }

  // Determine starting page count
  let currentPageCount = pageCount;
  if (packAllItems && estimate.minimumPagesNeeded > pageCount) {
    currentPageCount = estimate.minimumPagesNeeded;
    sendMessage({
      type: 'progress',
      message: `Auto-expanding from ${pageCount} to ${currentPageCount} pages`,
      percentComplete: 10
    });
  }

  const MAX_PAGES = 100;
  let allItemsPlaced = false;
  let finalSheets: any[] = [];
  let finalQuantities: { [stickerId: string]: number } = {};
  let attempts = 0;

  // Packing loop
  while (!allItemsPlaced && currentPageCount <= MAX_PAGES) {
    attempts++;
    sendMessage({
      type: 'progress',
      message: `Packing attempt #${attempts} with ${currentPageCount} pages`,
      totalSheets: currentPageCount,
      percentComplete: 10 + (attempts * 5)
    });

    const sheets: any[] = [];
    let remainingPolygons = [...polygons];

    // Pack each sheet
    for (let sheetIndex = 0; sheetIndex < currentPageCount && remainingPolygons.length > 0; sheetIndex++) {
      const sheetProgress = Math.floor(((sheetIndex + 1) / currentPageCount) * 70) + 15;

      sendMessage({
        type: 'progress',
        message: `Packing sheet ${sheetIndex + 1}/${currentPageCount}`,
        currentSheet: sheetIndex + 1,
        totalSheets: currentPageCount,
        itemsPlaced: polygons.length - remainingPolygons.length,
        totalItems: polygons.length,
        percentComplete: sheetProgress
      });

      // Set up real-time progress callback
      const packer = new PolygonPacker(
        sheetWidthInches,
        sheetHeightInches,
        spacingInches,
        cellsPerInch,
        stepSize,
        rotations,
        (progress) => {
          // Send both "trying" and "placed" events for real-time updates
          if (progress.status === 'trying') {
            sendMessage({
              type: 'progress',
              message: `Trying to place ${progress.itemId.split('_')[0]} on sheet ${sheetIndex + 1}...`,
              currentSheet: sheetIndex + 1,
              totalSheets: currentPageCount,
              itemsPlaced: polygons.length - remainingPolygons.length + progress.current,
              totalItems: polygons.length,
              percentComplete: sheetProgress
            });
          } else if (progress.status === 'placed' && progress.placement) {
            sendMessage({
              type: 'progress',
              message: `Placed ${progress.itemId.split('_')[0]} on sheet ${sheetIndex + 1}`,
              currentSheet: sheetIndex + 1,
              totalSheets: currentPageCount,
              itemsPlaced: polygons.length - remainingPolygons.length + progress.current,
              totalItems: polygons.length,
              percentComplete: sheetProgress,
              placement: {
                sheetIndex,
                id: progress.placement.id,
                x: progress.placement.x * MM_PER_INCH,
                y: progress.placement.y * MM_PER_INCH,
                rotation: progress.placement.rotation
              }
            });
          }
        }
      );

      const result = await packer.pack(remainingPolygons);

      if (result.placements.length === 0) {
        break;
      }

      // Convert placements (inches → mm)
      const placements = result.placements.map(p => ({
        id: p.id,
        x: p.x * MM_PER_INCH,
        y: p.y * MM_PER_INCH,
        rotation: p.rotation,
      }));

      // Calculate utilization
      const usedAreaInches = result.placements.reduce((sum, p) => {
        const poly = polygons.find(poly => poly.id === p.id);
        return sum + (poly ? poly.area : 0);
      }, 0);
      const sheetAreaInches = sheetWidthInches * sheetHeightInches;
      const utilization = (usedAreaInches / sheetAreaInches) * 100;

      sheets.push({
        sheetIndex,
        placements,
        utilization,
      });

      // Remove placed items
      const placedIds = new Set(result.placements.map(p => p.id));
      remainingPolygons = remainingPolygons.filter(p => !placedIds.has(p.id));
    }

    // Calculate quantities
    const quantities: { [stickerId: string]: number } = {};
    sheets.forEach(sheet => {
      sheet.placements.forEach((placement: any) => {
        quantities[placement.id] = (quantities[placement.id] || 0) + 1;
      });
    });

    // Check if all items placed
    if (remainingPolygons.length === 0) {
      allItemsPlaced = true;
      finalSheets = sheets;
      finalQuantities = quantities;

      sendMessage({
        type: 'progress',
        message: `Success! All ${stickers.length} items packed`,
        percentComplete: 90
      });
    } else {
      if (packAllItems) {
        currentPageCount++;
        if (currentPageCount > MAX_PAGES) {
          throw new Error(`Failed to pack all items even with ${MAX_PAGES} pages`);
        }
      } else {
        finalSheets = sheets;
        finalQuantities = quantities;
        break;
      }
    }
  }

  // Calculate total utilization
  const totalAreaInches = sheetWidthInches * sheetHeightInches * finalSheets.length;
  const totalUsedAreaInches = finalSheets.reduce((sum, sheet) => {
    return sum + sheet.placements.reduce((itemSum: number, p: any) => {
      const poly = polygons.find(poly => poly.id === p.id);
      return itemSum + (poly ? poly.area : 0);
    }, 0);
  }, 0);
  const totalUtilization = finalSheets.length > 0 ? (totalUsedAreaInches / totalAreaInches) * 100 : 0;

  // Generate message
  let message: string | undefined;
  const totalItemsPlaced = Object.values(finalQuantities).reduce((a, b) => a + b, 0);
  if (packAllItems && currentPageCount > pageCount) {
    message = `Auto-expanded from ${pageCount} to ${currentPageCount} pages to fit all ${stickers.length} items`;
  } else if (!packAllItems && totalItemsPlaced < stickers.length) {
    const unplaced = stickers.length - totalItemsPlaced;
    message = `${totalItemsPlaced}/${stickers.length} items packed. ${unplaced} items did not fit. Increase page count.`;
  }

  sendMessage({
    type: 'progress',
    message: 'Packing complete!',
    percentComplete: 100
  });

  sendMessage({
    type: 'result',
    result: {
      sheets: finalSheets,
      totalUtilization,
      quantities: finalQuantities,
      message,
    }
  });
}
