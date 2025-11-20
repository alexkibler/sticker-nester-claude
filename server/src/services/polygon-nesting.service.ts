/**
 * True Polygon Nesting Service
 *
 * Implements proper polygon nesting where shapes can interlock and fit together
 * like puzzle pieces, not just avoid colliding like rectangles.
 *
 * Key techniques:
 * - Sliding placement: Move polygons along edges until they touch
 * - Edge-to-edge nesting: Try to nestle shapes together
 * - Gravity-like settling: Push polygons down and left until they touch boundaries/other shapes
 */

import { Point } from './image.service';
import { GeometryService } from './geometry.service';

const geometryService = new GeometryService();

export interface NestablePolygon {
  id: string;
  points: Point[];  // vertices in inches
  width: number;
  height: number;
  area: number;
}

export interface NestedPlacement {
  id: string;
  x: number;         // reference point position
  y: number;
  rotation: number;
  points: Point[];   // final transformed points
}

export interface NestingResult {
  placements: NestedPlacement[];
  utilization: number;
  unplacedPolygons: NestablePolygon[];
}

/**
 * Collision detector using SAT with contact detection
 */
export class CollisionDetector {
  private static EPSILON = 0.0001; // Tolerance for "touching"

  /**
   * Check if two polygons overlap
   */
  static hasCollision(poly1: Point[], poly2: Point[]): boolean {
    // Quick bounding box check
    const bbox1 = this.getBoundingBox(poly1);
    const bbox2 = this.getBoundingBox(poly2);

    if (!this.bboxOverlap(bbox1, bbox2)) {
      return false;
    }

    // SAT collision detection
    return this.satOverlap(poly1, poly2) > this.EPSILON;
  }

  /**
   * Get overlap depth between two polygons using SAT
   * Returns 0 if no overlap, positive value indicates overlap depth
   */
  static satOverlap(poly1: Point[], poly2: Point[]): number {
    const axes = [
      ...this.getAxes(poly1),
      ...this.getAxes(poly2)
    ];

    let minOverlap = Infinity;

    for (const axis of axes) {
      const proj1 = this.projectPolygon(poly1, axis);
      const proj2 = this.projectPolygon(poly2, axis);

      // Check for separation
      if (proj1.max < proj2.min || proj2.max < proj1.min) {
        return 0; // No overlap
      }

      // Calculate overlap on this axis
      const overlap = Math.min(proj1.max - proj2.min, proj2.max - proj1.min);
      minOverlap = Math.min(minOverlap, overlap);
    }

    return minOverlap;
  }

  /**
   * Check if polygon is within bounds
   */
  static isInBounds(poly: Point[], width: number, height: number): boolean {
    for (const p of poly) {
      if (p.x < -this.EPSILON || p.x > width + this.EPSILON ||
          p.y < -this.EPSILON || p.y > height + this.EPSILON) {
        return false;
      }
    }
    return true;
  }

  private static getBoundingBox(poly: Point[]) {
    const xs = poly.map(p => p.x);
    const ys = poly.map(p => p.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys)
    };
  }

  private static bboxOverlap(b1: any, b2: any): boolean {
    return !(b1.maxX < b2.minX || b1.minX > b2.maxX ||
             b1.maxY < b2.minY || b1.minY > b2.maxY);
  }

  private static getAxes(poly: Point[]): Point[] {
    const axes: Point[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const edge = { x: p2.x - p1.x, y: p2.y - p1.y };
      const normal = { x: -edge.y, y: edge.x };
      const length = Math.sqrt(normal.x ** 2 + normal.y ** 2);
      if (length > 0.0001) {
        axes.push({ x: normal.x / length, y: normal.y / length });
      }
    }
    return axes;
  }

  private static projectPolygon(poly: Point[], axis: Point) {
    let min = poly[0].x * axis.x + poly[0].y * axis.y;
    let max = min;
    for (let i = 1; i < poly.length; i++) {
      const proj = poly[i].x * axis.x + poly[i].y * axis.y;
      if (proj < min) min = proj;
      if (proj > max) max = proj;
    }
    return { min, max };
  }
}

/**
 * Gravity-based nesting algorithm
 * Tries to nestle polygons together by "dropping" them and sliding them into tight spaces
 */
export class GravityNester {
  private sheetWidth: number;
  private sheetHeight: number;
  private spacing: number;
  private rotations: number[];
  private placements: NestedPlacement[] = [];

  constructor(
    sheetWidth: number,
    sheetHeight: number,
    spacing: number = 0.0625,
    rotations: number[] = [0, 90, 180, 270]
  ) {
    this.sheetWidth = sheetWidth;
    this.sheetHeight = sheetHeight;
    this.spacing = spacing;
    this.rotations = rotations;
  }

  /**
   * Nest polygons using gravity-based placement
   */
  async nest(polygons: NestablePolygon[]): Promise<NestingResult> {
    console.log(`\n=== Gravity-Based Polygon Nesting ===`);
    console.log(`Items: ${polygons.length}`);
    console.log(`Sheet: ${this.sheetWidth}" × ${this.sheetHeight}"`);

    // Sort by area descending
    const sorted = [...polygons].sort((a, b) => b.area - a.area);

    this.placements = [];
    const unplaced: NestablePolygon[] = [];
    let usedArea = 0;

    for (let i = 0; i < sorted.length; i++) {
      const polygon = sorted[i];
      console.log(`\n[${i + 1}/${sorted.length}] Placing ${polygon.id}...`);

      const placement = await this.findNestingPosition(polygon);

      if (placement) {
        this.placements.push(placement);
        usedArea += polygon.area;
        console.log(`  ✓ Nested at (${placement.x.toFixed(2)}, ${placement.y.toFixed(2)}) rotation ${placement.rotation}°`);
      } else {
        unplaced.push(polygon);
        console.log(`  ✗ Could not nest ${polygon.id}`);
      }

      // Yield to event loop
      await new Promise(resolve => setImmediate(resolve));
    }

    const sheetArea = this.sheetWidth * this.sheetHeight;
    const utilization = (usedArea / sheetArea) * 100;

    console.log(`\n=== Nesting Complete ===`);
    console.log(`Placed: ${this.placements.length}/${polygons.length}`);
    console.log(`Utilization: ${utilization.toFixed(1)}%`);

    return {
      placements: this.placements,
      utilization,
      unplacedPolygons: unplaced
    };
  }

  /**
   * Find best nesting position for a polygon
   * Tries to nestle it tightly against already-placed polygons
   *
   * KEY: Use offset polygon for collision detection, but return ORIGINAL polygon for display
   */
  private async findNestingPosition(polygon: NestablePolygon): Promise<NestedPlacement | null> {
    let bestPlacement: NestedPlacement | null = null;
    let bestScore = Infinity;

    // Try each rotation
    for (const rotation of this.rotations) {
      // Get rotated polygon WITHOUT spacing (for final display)
      const rotatedOriginal = rotation !== 0
        ? geometryService.rotatePoints(polygon.points, rotation)
        : polygon.points;

      // Get rotated polygon WITH spacing (for collision detection)
      const rotatedWithSpacing = this.preparePolygon(polygon, rotation);
      const bboxWithSpacing = geometryService.getBoundingBox(rotatedWithSpacing);

      // If this is the first polygon, place at origin
      if (this.placements.length === 0) {
        const translatedWithSpacing = this.translatePolygon(rotatedWithSpacing, 0, 0, bboxWithSpacing);
        if (CollisionDetector.isInBounds(translatedWithSpacing, this.sheetWidth, this.sheetHeight)) {
          // Return ORIGINAL polygon (without spacing offset) at found position
          const bboxOriginal = geometryService.getBoundingBox(rotatedOriginal);
          const translatedOriginal = this.translatePolygon(rotatedOriginal, 0, 0, bboxOriginal);

          return {
            id: polygon.id,
            x: 0,
            y: 0,
            rotation,
            points: translatedOriginal  // Original shape, not offset
          };
        }
        continue;
      }

      // Try "gravity drop" from various starting positions
      const candidates = this.generateCandidatePositions(bboxWithSpacing);

      for (const startPos of candidates) {
        // Find position using OFFSET polygon (with spacing)
        const nestPosition = this.gravityDrop(
          rotatedWithSpacing,
          bboxWithSpacing,
          startPos.x,
          startPos.y,
          rotation
        );

        if (nestPosition) {
          // Score based on distance from origin (prefer bottom-left)
          const score = nestPosition.x + nestPosition.y;

          if (score < bestScore) {
            bestScore = score;

            // Translate ORIGINAL polygon (without spacing) to the found position
            const bboxOriginal = geometryService.getBoundingBox(rotatedOriginal);
            const translatedOriginal = this.translatePolygon(
              rotatedOriginal,
              nestPosition.x,
              nestPosition.y,
              bboxOriginal
            );

            bestPlacement = {
              id: polygon.id,
              x: nestPosition.x,
              y: nestPosition.y,
              rotation,
              points: translatedOriginal  // Original shape, not offset
            };
          }
        }
      }
    }

    return bestPlacement;
  }

  /**
   * Apply rotation and spacing to polygon
   */
  private preparePolygon(polygon: NestablePolygon, rotation: number): Point[] {
    let points = polygon.points;

    if (rotation !== 0) {
      points = geometryService.rotatePoints(points, rotation);
    }

    if (this.spacing > 0) {
      points = geometryService.offsetPolygon(points, this.spacing / 2);
    }

    return points;
  }

  /**
   * Generate candidate starting positions for gravity drop
   * Focus on positions NEAR already-placed shapes for nesting
   */
  private generateCandidatePositions(bbox: any): Array<{x: number, y: number}> {
    const positions: Array<{x: number, y: number}> = [];

    if (this.placements.length === 0) {
      // First shape - just try origin
      positions.push({ x: 0, y: 0 });
      return positions;
    }

    // Try positions AROUND and NEAR each placed shape (for nesting)
    const step = 0.1; // 0.1 inch steps

    for (const placement of this.placements) {
      const placedBbox = geometryService.getBoundingBox(placement.points);

      // Dense grid AROUND this shape (enables nestling into concave regions)
      const searchRadius = Math.max(bbox.width, bbox.height, 1.0);

      for (let dy = -searchRadius; dy <= placedBbox.height + searchRadius; dy += step) {
        for (let dx = -searchRadius; dx <= placedBbox.width + searchRadius; dx += step) {
          const x = placedBbox.minX + dx;
          const y = placedBbox.minY + dy;

          // Only add if within sheet bounds
          if (x >= 0 && x <= this.sheetWidth - bbox.width &&
              y >= 0 && y <= this.sheetHeight - bbox.height) {
            positions.push({ x, y });
          }
        }
      }
    }

    // Also try a coarse scan of the TOP of the sheet (for new rows)
    const coarseStep = Math.max(bbox.width / 2, 0.5);
    for (let x = 0; x <= this.sheetWidth - bbox.width; x += coarseStep) {
      positions.push({ x, y: 0 });
    }

    return positions;
  }

  /**
   * "Drop" polygon using gravity - let it fall down and settle
   * Then slide it left until it touches something
   *
   * NOTE: preparedPoints should already have spacing offset applied
   * We check collision against the placed polygons ALSO with spacing applied
   */
  private gravityDrop(
    preparedPoints: Point[],
    bbox: any,
    startX: number,
    startY: number,
    rotation: number
  ): { x: number, y: number, points: Point[] } | null {
    const slideStep = 0.02; // FINE 0.02 inch steps for tight nesting
    let x = startX;
    let y = startY;

    // Pre-calculate offset versions of placed polygons for collision detection
    // (placed polygons are stored WITHOUT spacing offset, so we need to add it for collision checks)
    const placedWithSpacing = this.placements.map(placed => {
      if (this.spacing > 0) {
        return geometryService.offsetPolygon(placed.points, this.spacing / 2);
      }
      return placed.points;
    });

    // Phase 1: Drop down until collision or bottom
    while (y <= this.sheetHeight - bbox.height) {
      const translated = this.translatePolygon(preparedPoints, x, y, bbox);

      // Check bounds
      if (!CollisionDetector.isInBounds(translated, this.sheetWidth, this.sheetHeight)) {
        break;
      }

      // Check collision with placed polygons (WITH spacing)
      let hasCollision = false;
      for (const placedOffset of placedWithSpacing) {
        if (CollisionDetector.hasCollision(translated, placedOffset)) {
          hasCollision = true;
          break;
        }
      }

      if (hasCollision) {
        // Back up one step
        y -= slideStep;
        break;
      }

      y += slideStep;
    }

    // Ensure we're still in bounds
    y = Math.max(0, Math.min(y, this.sheetHeight - bbox.height));

    // Phase 2: Slide left until collision or left edge
    while (x >= 0) {
      const translated = this.translatePolygon(preparedPoints, x, y, bbox);

      // Check bounds
      if (!CollisionDetector.isInBounds(translated, this.sheetWidth, this.sheetHeight)) {
        x += slideStep;
        break;
      }

      // Check collision (WITH spacing)
      let hasCollision = false;
      for (const placedOffset of placedWithSpacing) {
        if (CollisionDetector.hasCollision(translated, placedOffset)) {
          hasCollision = true;
          break;
        }
      }

      if (hasCollision) {
        // Back up one step
        x += slideStep;
        break;
      }

      x -= slideStep;
    }

    // Clamp to bounds
    x = Math.max(0, Math.min(x, this.sheetWidth - bbox.width));

    // Final validation
    const finalTranslated = this.translatePolygon(preparedPoints, x, y, bbox);

    if (!CollisionDetector.isInBounds(finalTranslated, this.sheetWidth, this.sheetHeight)) {
      return null;
    }

    for (const placedOffset of placedWithSpacing) {
      if (CollisionDetector.hasCollision(finalTranslated, placedOffset)) {
        return null;
      }
    }

    return { x, y, points: finalTranslated };
  }

  /**
   * Translate polygon to position
   */
  private translatePolygon(points: Point[], x: number, y: number, bbox: any): Point[] {
    const offsetX = x - bbox.minX;
    const offsetY = y - bbox.minY;
    return points.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
  }
}

/**
 * Multi-sheet nesting with Oversubscribe and Sort strategy
 *
 * PRODUCTION MODE (packAllItems=false): Fill exactly the requested pages
 * - User requests 5 pages → Fill those 5 pages with best selection
 * - Oversubscribe creates MORE candidates than fit
 * - Pack what fits best into the REQUESTED pages
 *
 * AUTO-EXPAND MODE (packAllItems=true): Add pages until all items fit
 * - Useful for "pack these specific items, use however many pages needed"
 */
export class MultiSheetNester {
  static async nestMultiSheet(
    polygons: NestablePolygon[],
    pageCount: number,
    sheetWidth: number,
    sheetHeight: number,
    spacing: number = 0.0625,
    rotations: number[] = [0, 90, 180, 270],
    packAllItems: boolean = false  // CHANGED: Default to false for production mode
  ): Promise<{
    sheets: Array<{ sheetIndex: number; placements: NestedPlacement[]; utilization: number }>;
    quantities: { [id: string]: number };
    totalUtilization: number;
    message?: string;
  }> {
    console.log(`\n=== Multi-Sheet Polygon Nesting ===`);
    console.log(`Unique designs: ${polygons.length}`);
    console.log(`Requested pages: ${pageCount}`);
    console.log(`Mode: ${packAllItems ? 'AUTO-EXPAND (pack all)' : 'PRODUCTION (fill requested pages)'}`);

    // Step 1: Generate candidate pool (Oversubscribe strategy)
    // Create MORE candidates than will fit, then pack what fits best
    const targetArea = pageCount * sheetWidth * sheetHeight;
    const buffer = pageCount <= 5 ? 1.15 : 1.10;
    const targetWithBuffer = targetArea * buffer;

    const candidatePool: NestablePolygon[] = [];
    const instanceCounts: { [id: string]: number } = {};
    polygons.forEach(p => instanceCounts[p.id] = 0);

    let currentArea = 0;
    let index = 0;
    const MAX_CANDIDATES = 5000;

    while (currentArea < targetWithBuffer && candidatePool.length < MAX_CANDIDATES) {
      const original = polygons[index % polygons.length];
      const instanceId = `${original.id}_${instanceCounts[original.id]}`;
      instanceCounts[original.id]++;

      candidatePool.push({
        ...original,
        id: instanceId
      });

      currentArea += original.area;
      index++;
    }

    console.log(`Generated ${candidatePool.length} candidates (${Math.round(buffer * 100 - 100)}% oversubscribed)`);

    // Step 2: Sort by area descending (Big Rocks First)
    candidatePool.sort((a, b) => b.area - a.area);

    // Step 3: Pack into the REQUESTED number of pages
    const sheets: any[] = [];
    let remaining = [...candidatePool];

    for (let sheetIndex = 0; sheetIndex < pageCount && remaining.length > 0; sheetIndex++) {
      console.log(`\nPacking sheet ${sheetIndex + 1}/${pageCount}...`);

      const nester = new GravityNester(sheetWidth, sheetHeight, spacing, rotations);
      const result = await nester.nest(remaining);

      if (result.placements.length === 0) {
        console.log(`  No items fit on sheet ${sheetIndex + 1}, stopping.`);
        break;
      }

      sheets.push({
        sheetIndex,
        placements: result.placements,
        utilization: result.utilization
      });

      const placedIds = new Set(result.placements.map(p => p.id));
      remaining = remaining.filter(p => !placedIds.has(p.id));

      console.log(`  Placed ${result.placements.length} items, ${remaining.length} candidates remaining`);
    }

    // Step 4: If packAllItems=true and candidates remain, add more sheets
    if (packAllItems && remaining.length > 0) {
      console.log(`\n⚠ ${remaining.length} candidates remain after ${pageCount} pages. Auto-expanding...`);

      const MAX_PAGES = 100;
      let additionalSheetIndex = pageCount;

      while (remaining.length > 0 && additionalSheetIndex < MAX_PAGES) {
        console.log(`\nPacking additional sheet ${additionalSheetIndex + 1}...`);

        const nester = new GravityNester(sheetWidth, sheetHeight, spacing, rotations);
        const result = await nester.nest(remaining);

        if (result.placements.length === 0) {
          console.log(`  No more items fit. Stopping at ${sheets.length} sheets.`);
          break;
        }

        sheets.push({
          sheetIndex: additionalSheetIndex,
          placements: result.placements,
          utilization: result.utilization
        });

        const placedIds = new Set(result.placements.map(p => p.id));
        remaining = remaining.filter(p => !placedIds.has(p.id));

        console.log(`  Placed ${result.placements.length} items, ${remaining.length} candidates remaining`);
        additionalSheetIndex++;
      }
    }

    // Calculate quantities
    const quantities: { [id: string]: number } = {};
    sheets.forEach(sheet => {
      sheet.placements.forEach((p: NestedPlacement) => {
        const originalId = p.id.replace(/_\d+$/, '');
        quantities[originalId] = (quantities[originalId] || 0) + 1;
      });
    });

    // Calculate total utilization
    const totalArea = sheetWidth * sheetHeight * sheets.length;
    let usedArea = 0;
    sheets.forEach(sheet => {
      sheet.placements.forEach((p: NestedPlacement) => {
        const originalId = p.id.replace(/_\d+$/, '');
        const original = polygons.find(poly => poly.id === originalId);
        if (original) usedArea += original.area;
      });
    });
    const totalUtilization = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;

    // Generate message
    let message: string | undefined;
    const totalItemsPlaced = Object.values(quantities).reduce((a, b) => a + b, 0);
    const totalCandidates = candidatePool.length;

    if (packAllItems && sheets.length > pageCount) {
      message = `Auto-expanded from ${pageCount} to ${sheets.length} pages to fit all items`;
    } else if (totalItemsPlaced < totalCandidates) {
      const unplaced = totalCandidates - totalItemsPlaced;
      message = `Filled ${pageCount} pages. Placed ${totalItemsPlaced}/${totalCandidates} candidates (${unplaced} didn't fit).`;
    }

    console.log(`\n✓ Packed ${sheets.length} sheets with ${totalItemsPlaced} total items`);
    console.log(`Quantities:`, quantities);
    if (message) console.log(`Message: ${message}`);

    return {
      sheets,
      quantities,
      totalUtilization,
      message
    };
  }
}
