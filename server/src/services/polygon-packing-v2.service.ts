/**
 * Polygon Packing Service V2
 *
 * Redesigned polygon packing algorithm that eliminates grid rasterization
 * and implements proper multi-sheet production mode.
 *
 * Key improvements:
 * - Direct polygon-polygon collision detection using ClipperLib
 * - Bottom-Left placement heuristic for efficient packing
 * - Multi-sheet production mode with "Oversubscribe and Sort" strategy
 * - User specifies page count, algorithm determines quantities
 * - Graceful handling when items don't fit (no errors, just reporting)
 */

import * as ClipperLib from 'clipper-lib';
import { Point } from './image.service';
import { GeometryService } from './geometry.service';

const geometryService = new GeometryService();
const CLIPPER_SCALE = 10000; // Higher precision for collision detection

/**
 * Packable polygon with metadata
 */
export interface PackablePolygon {
  id: string;
  points: Point[]; // vertices in inches
  width: number;   // bounding box width
  height: number;  // bounding box height
  area: number;    // approximate area
}

/**
 * Placed polygon with position and rotation
 */
export interface PolygonPlacement {
  id: string;
  x: number;        // position in inches
  y: number;        // position in inches
  rotation: number; // rotation in degrees
  points: Point[];  // transformed points at final position
}

/**
 * Single-sheet packing result
 */
export interface PolygonPackingResult {
  placements: PolygonPlacement[];
  utilization: number;
  unplacedPolygons: PackablePolygon[];
  sheetArea: number;
  usedArea: number;
}

/**
 * Multi-sheet packing result (matches rectangle packing format)
 */
export interface MultiSheetPolygonResult {
  sheets: Array<{
    sheetIndex: number;
    placements: PolygonPlacement[];
    utilization: number;
  }>;
  totalUtilization: number;
  quantities: { [stickerId: string]: number };
  message?: string;
}

/**
 * Progress callback for real-time updates
 */
export interface PackingProgress {
  current: number;
  total: number;
  itemId: string;
  status: 'trying' | 'placed' | 'failed' | 'estimating';
  message: string;
  placement?: PolygonPlacement;
}

export type ProgressCallback = (progress: PackingProgress) => void;

/**
 * Configuration for packing algorithm
 */
export interface PackingConfig {
  sheetWidth: number;      // in inches
  sheetHeight: number;     // in inches
  spacing: number;         // minimum spacing between items in inches
  rotations: number[];     // rotation angles to try (degrees)
  progressCallback?: ProgressCallback;
}

/**
 * Polygon collision detector using Separating Axis Theorem (SAT)
 */
export class PolygonCollisionDetector {
  /**
   * Check if two polygons overlap (collision detection using SAT)
   */
  static checkCollision(poly1: Point[], poly2: Point[]): boolean {
    // Quick bounding box check first
    const bbox1 = this.getBoundingBox(poly1);
    const bbox2 = this.getBoundingBox(poly2);

    if (!this.bboxOverlap(bbox1, bbox2)) {
      return false; // No bounding box overlap = no collision
    }

    // Use Separating Axis Theorem for precise collision detection
    // Check if polygons are separated along any axis
    return this.satCollision(poly1, poly2);
  }

  /**
   * Check if polygon is fully within bounds
   */
  static checkBounds(poly: Point[], width: number, height: number): boolean {
    for (const point of poly) {
      if (point.x < 0 || point.x > width || point.y < 0 || point.y > height) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get bounding box of polygon
   */
  private static getBoundingBox(poly: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
    const xs = poly.map(p => p.x);
    const ys = poly.map(p => p.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys)
    };
  }

  /**
   * Check if two bounding boxes overlap
   */
  private static bboxOverlap(
    bbox1: { minX: number; minY: number; maxX: number; maxY: number },
    bbox2: { minX: number; minY: number; maxX: number; maxY: number }
  ): boolean {
    return !(
      bbox1.maxX < bbox2.minX ||
      bbox1.minX > bbox2.maxX ||
      bbox1.maxY < bbox2.minY ||
      bbox1.minY > bbox2.maxY
    );
  }

  /**
   * Separating Axis Theorem collision detection
   */
  private static satCollision(poly1: Point[], poly2: Point[]): boolean {
    // Get all axes to test (perpendiculars to edges)
    const axes = [
      ...this.getAxes(poly1),
      ...this.getAxes(poly2)
    ];

    // Check each axis for separation
    for (const axis of axes) {
      const proj1 = this.projectPolygon(poly1, axis);
      const proj2 = this.projectPolygon(poly2, axis);

      // If projections don't overlap, polygons are separated
      if (proj1.max < proj2.min || proj2.max < proj1.min) {
        return false; // No collision
      }
    }

    // No separating axis found = collision!
    return true;
  }

  /**
   * Get perpendicular axes from polygon edges
   */
  private static getAxes(poly: Point[]): Point[] {
    const axes: Point[] = [];

    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];

      // Edge vector
      const edge = { x: p2.x - p1.x, y: p2.y - p1.y };

      // Perpendicular (normal) - rotate 90 degrees
      const normal = { x: -edge.y, y: edge.x };

      // Normalize
      const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y);
      if (length > 0.0001) {
        axes.push({ x: normal.x / length, y: normal.y / length });
      }
    }

    return axes;
  }

  /**
   * Project polygon onto axis
   */
  private static projectPolygon(poly: Point[], axis: Point): { min: number; max: number } {
    let min = poly[0].x * axis.x + poly[0].y * axis.y;
    let max = min;

    for (let i = 1; i < poly.length; i++) {
      const projection = poly[i].x * axis.x + poly[i].y * axis.y;
      if (projection < min) min = projection;
      if (projection > max) max = projection;
    }

    return { min, max };
  }
}

/**
 * Bottom-Left placement strategy for polygon packing
 */
export class BottomLeftPacker {
  private config: PackingConfig;
  private placements: PolygonPlacement[] = [];
  private geometryService = new GeometryService();

  constructor(config: PackingConfig) {
    this.config = config;
  }

  /**
   * Pack polygons using Bottom-Left heuristic
   */
  async pack(polygons: PackablePolygon[]): Promise<PolygonPackingResult> {
    console.log(`\n=== Bottom-Left Polygon Packing ===`);
    console.log(`Items: ${polygons.length}`);
    console.log(`Sheet: ${this.config.sheetWidth}" × ${this.config.sheetHeight}"`);
    console.log(`Rotations: ${this.config.rotations.join(', ')}°`);

    // Sort by area descending (Big Rocks First)
    const sorted = [...polygons].sort((a, b) => b.area - a.area);

    this.placements = [];
    const unplaced: PackablePolygon[] = [];
    const sheetArea = this.config.sheetWidth * this.config.sheetHeight;
    let usedArea = 0;

    // Try to place each polygon
    for (let i = 0; i < sorted.length; i++) {
      const polygon = sorted[i];

      if (this.config.progressCallback) {
        this.config.progressCallback({
          current: i,
          total: sorted.length,
          itemId: polygon.id,
          status: 'trying',
          message: `Trying to place ${polygon.id}...`
        });
      }

      // Yield to event loop
      await new Promise(resolve => setImmediate(resolve));

      const placement = this.findPlacement(polygon);

      if (placement) {
        this.placements.push(placement);
        usedArea += polygon.area;

        console.log(`  ✓ Placed ${polygon.id} at (${placement.x.toFixed(2)}, ${placement.y.toFixed(2)}) rotation ${placement.rotation}°`);

        if (this.config.progressCallback) {
          this.config.progressCallback({
            current: i + 1,
            total: sorted.length,
            itemId: polygon.id,
            status: 'placed',
            message: `Placed ${polygon.id}`,
            placement
          });
        }

        await new Promise(resolve => setImmediate(resolve));
      } else {
        unplaced.push(polygon);
        console.log(`  ✗ Failed to place ${polygon.id}`);

        if (this.config.progressCallback) {
          this.config.progressCallback({
            current: i + 1,
            total: sorted.length,
            itemId: polygon.id,
            status: 'failed',
            message: `Failed to place ${polygon.id}`
          });
        }
      }
    }

    const utilization = (usedArea / sheetArea) * 100;

    console.log(`\n=== Packing Complete ===`);
    console.log(`Placed: ${this.placements.length}/${polygons.length}`);
    console.log(`Utilization: ${utilization.toFixed(1)}%`);

    return {
      placements: this.placements,
      utilization,
      unplacedPolygons: unplaced,
      sheetArea,
      usedArea
    };
  }

  /**
   * Find valid placement for a polygon using Bottom-Left heuristic
   */
  private findPlacement(polygon: PackablePolygon): PolygonPlacement | null {
    let bestPlacement: PolygonPlacement | null = null;
    let bestScore = Infinity; // Lower is better (closer to bottom-left)

    // Try each rotation
    for (const rotation of this.config.rotations) {
      // Apply rotation and spacing
      const rotated = this.preparePolygon(polygon, rotation);

      // Try to find Bottom-Left position
      const placement = this.findBottomLeftPosition(polygon.id, rotated, rotation);

      if (placement) {
        // Score based on distance from origin (bottom-left is 0,0)
        const score = placement.x + placement.y;

        if (score < bestScore) {
          bestScore = score;
          bestPlacement = placement;
        }
      }
    }

    return bestPlacement;
  }

  /**
   * Apply rotation and spacing offset to polygon
   */
  private preparePolygon(polygon: PackablePolygon, rotation: number): Point[] {
    let points = polygon.points;

    // Apply rotation
    if (rotation !== 0) {
      points = this.geometryService.rotatePoints(points, rotation);
    }

    // Apply spacing using offset
    if (this.config.spacing > 0) {
      points = this.geometryService.offsetPolygon(points, this.config.spacing / 2);
    }

    return points;
  }

  /**
   * Find bottom-left position for a polygon
   * Strategy: Start at top-right, slide left until collision, slide down until collision, repeat
   */
  private findBottomLeftPosition(
    id: string,
    preparedPoints: Point[],
    rotation: number
  ): PolygonPlacement | null {
    const bbox = this.geometryService.getBoundingBox(preparedPoints);
    const stepSize = 0.1; // 0.1 inch steps

    // Start from top-right corner
    let x = this.config.sheetWidth - bbox.width;
    let y = 0;

    // Scan from top to bottom
    while (y <= this.config.sheetHeight - bbox.height) {
      // Scan from right to left
      x = this.config.sheetWidth - bbox.width;

      while (x >= 0) {
        // Translate polygon to current position
        const translated = this.translatePolygon(preparedPoints, x, y, bbox);

        // Check bounds
        if (!PolygonCollisionDetector.checkBounds(
          translated,
          this.config.sheetWidth,
          this.config.sheetHeight
        )) {
          x -= stepSize;
          continue;
        }

        // Check collisions with placed polygons
        let hasCollision = false;
        for (const placed of this.placements) {
          if (PolygonCollisionDetector.checkCollision(translated, placed.points)) {
            hasCollision = true;
            break;
          }
        }

        if (!hasCollision) {
          // Found valid position!
          return {
            id,
            x,
            y,
            rotation,
            points: translated
          };
        }

        x -= stepSize;
      }

      y += stepSize;
    }

    return null;
  }

  /**
   * Translate polygon to a specific position
   */
  private translatePolygon(points: Point[], x: number, y: number, bbox: any): Point[] {
    const offsetX = x - bbox.minX;
    const offsetY = y - bbox.minY;

    return points.map(p => ({
      x: p.x + offsetX,
      y: p.y + offsetY
    }));
  }

  /**
   * Get current placements
   */
  getPlacements(): PolygonPlacement[] {
    return this.placements;
  }
}

/**
 * Multi-sheet polygon packer with "Oversubscribe and Sort" strategy
 */
export class MultiSheetPolygonPacker {
  /**
   * Pack polygons across multiple sheets (production mode)
   *
   * User specifies pageCount, algorithm determines quantities automatically
   * Uses "Oversubscribe and Sort" strategy like rectangle packing
   */
  static async packMultiSheet(
    polygons: PackablePolygon[],
    pageCount: number,
    config: PackingConfig,
    packAllItems: boolean = true
  ): Promise<MultiSheetPolygonResult> {
    console.log(`\n=== Multi-Sheet Polygon Packing ===`);
    console.log(`Items: ${polygons.length} unique designs`);
    console.log(`Requested pages: ${pageCount}`);
    console.log(`Mode: ${packAllItems ? 'PACK ALL (auto-expand)' : 'FIXED PAGES'}`);

    if (polygons.length === 0 || pageCount === 0) {
      return {
        sheets: [],
        totalUtilization: 0,
        quantities: {}
      };
    }

    // Step 1: Calculate target area with buffer (Oversubscribe strategy)
    const targetArea = pageCount * config.sheetWidth * config.sheetHeight;
    const bufferMultiplier = pageCount <= 5 ? 1.15 : pageCount <= 20 ? 1.10 : 1.05;
    const targetWithBuffer = targetArea * bufferMultiplier;

    console.log(`Target area: ${targetArea.toFixed(2)} sq in`);
    console.log(`With ${((bufferMultiplier - 1) * 100).toFixed(0)}% buffer: ${targetWithBuffer.toFixed(2)} sq in`);

    // Step 2: Generate candidate pool by cycling through designs (balanced distribution)
    const candidatePool: PackablePolygon[] = [];
    const instanceCounter: { [id: string]: number } = {};

    polygons.forEach(p => instanceCounter[p.id] = 0);

    let currentArea = 0;
    let stickerIndex = 0;
    const MAX_CANDIDATES = 5000;

    while (currentArea < targetWithBuffer && candidatePool.length < MAX_CANDIDATES) {
      const original = polygons[stickerIndex % polygons.length];
      const instanceId = `${original.id}_${instanceCounter[original.id]}`;
      instanceCounter[original.id]++;

      candidatePool.push({
        ...original,
        id: instanceId
      });

      currentArea += original.area;
      stickerIndex++;

      if (candidatePool.length % 500 === 0) {
        console.log(`  Generated ${candidatePool.length} candidates...`);
      }
    }

    console.log(`Generated ${candidatePool.length} candidates, total area: ${currentArea.toFixed(2)} sq in`);

    // Step 3: Sort by area descending (Big Rocks First)
    candidatePool.sort((a, b) => b.area - a.area);

    // Step 4: Pack sheets with auto-expansion if needed
    let currentPageCount = pageCount;
    let allItemsPlaced = false;
    let finalSheets: any[] = [];
    let finalQuantities: { [id: string]: number } = {};
    const MAX_PAGES = 100;

    while (!allItemsPlaced && currentPageCount <= MAX_PAGES) {
      const sheets: any[] = [];
      let remaining = [...candidatePool];
      let totalUsedArea = 0;

      // Pack each sheet
      for (let sheetIndex = 0; sheetIndex < currentPageCount && remaining.length > 0; sheetIndex++) {
        console.log(`\nPacking sheet ${sheetIndex + 1}/${currentPageCount}...`);

        const packer = new BottomLeftPacker({
          ...config,
          progressCallback: (progress) => {
            if (config.progressCallback) {
              config.progressCallback({
                ...progress,
                message: `Sheet ${sheetIndex + 1}/${currentPageCount}: ${progress.message}`
              });
            }
          }
        });

        const result = await packer.pack(remaining);

        if (result.placements.length === 0) {
          break; // No more items fit
        }

        sheets.push({
          sheetIndex,
          placements: result.placements,
          utilization: result.utilization
        });

        totalUsedArea += result.usedArea;

        // Remove placed items
        const placedIds = new Set(result.placements.map(p => p.id));
        remaining = remaining.filter(p => !placedIds.has(p.id));

        console.log(`  Sheet ${sheetIndex + 1}: Placed ${result.placements.length} items, ${remaining.length} remaining`);
      }

      // Calculate quantities (strip instance suffix)
      const quantities: { [id: string]: number } = {};
      sheets.forEach(sheet => {
        sheet.placements.forEach((p: PolygonPlacement) => {
          const originalId = p.id.replace(/_\d+$/, '');
          quantities[originalId] = (quantities[originalId] || 0) + 1;
        });
      });

      // Check if all items placed
      if (remaining.length === 0) {
        allItemsPlaced = true;
        finalSheets = sheets;
        finalQuantities = quantities;
        console.log(`\n✓ All items placed in ${sheets.length} sheets!`);
      } else {
        if (packAllItems && currentPageCount < MAX_PAGES) {
          // Auto-expand
          const oldCount = currentPageCount;
          currentPageCount++;
          console.log(`\n→ Auto-expanding from ${oldCount} to ${currentPageCount} pages (${remaining.length} items remaining)`);
        } else {
          // Fixed pages mode or hit max - stop here
          finalSheets = sheets;
          finalQuantities = quantities;
          console.log(`\n⚠ ${remaining.length} items could not fit in ${sheets.length} sheets`);
          break;
        }
      }
    }

    // Calculate total utilization
    const totalSheetArea = config.sheetWidth * config.sheetHeight * finalSheets.length;
    let totalUsedArea = 0;
    finalSheets.forEach(sheet => {
      sheet.placements.forEach((p: PolygonPlacement) => {
        const originalId = p.id.replace(/_\d+$/, '');
        const original = polygons.find(poly => poly.id === originalId);
        if (original) totalUsedArea += original.area;
      });
    });
    const totalUtilization = totalSheetArea > 0 ? (totalUsedArea / totalSheetArea) * 100 : 0;

    // Generate message
    let message: string | undefined;
    const totalPlaced = Object.values(finalQuantities).reduce((a, b) => a + b, 0);
    const totalRequested = candidatePool.length;

    if (packAllItems && currentPageCount > pageCount) {
      message = `Auto-expanded from ${pageCount} to ${currentPageCount} pages to fit all items`;
    } else if (!packAllItems && totalPlaced < polygons.length) {
      const unplaced = polygons.length - Object.keys(finalQuantities).length;
      message = `${Object.keys(finalQuantities).length}/${polygons.length} unique items packed. ${unplaced} items did not fit. Increase page count.`;
    }

    console.log(`\n=== Multi-Sheet Packing Complete ===`);
    console.log(`Total sheets: ${finalSheets.length}`);
    console.log(`Total items placed: ${totalPlaced}`);
    console.log(`Total utilization: ${totalUtilization.toFixed(1)}%`);
    console.log(`Quantities:`, finalQuantities);

    return {
      sheets: finalSheets,
      totalUtilization,
      quantities: finalQuantities,
      message
    };
  }
}
