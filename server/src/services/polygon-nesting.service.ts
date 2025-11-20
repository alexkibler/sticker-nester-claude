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
   */
  private async findNestingPosition(polygon: NestablePolygon): Promise<NestedPlacement | null> {
    let bestPlacement: NestedPlacement | null = null;
    let bestScore = Infinity;

    // Try each rotation
    for (const rotation of this.rotations) {
      const rotated = this.preparePolygon(polygon, rotation);
      const bbox = geometryService.getBoundingBox(rotated);

      // If this is the first polygon, place at origin
      if (this.placements.length === 0) {
        const translated = this.translatePolygon(rotated, 0, 0, bbox);
        if (CollisionDetector.isInBounds(translated, this.sheetWidth, this.sheetHeight)) {
          return {
            id: polygon.id,
            x: 0,
            y: 0,
            rotation,
            points: translated
          };
        }
        continue;
      }

      // Try "gravity drop" from various starting positions
      const candidates = this.generateCandidatePositions(bbox);

      for (const startPos of candidates) {
        const nestPosition = this.gravityDrop(rotated, bbox, startPos.x, startPos.y, rotation);

        if (nestPosition) {
          // Score based on distance from origin (prefer bottom-left)
          const score = nestPosition.x + nestPosition.y;

          if (score < bestScore) {
            bestScore = score;
            bestPlacement = {
              id: polygon.id,
              ...nestPosition,
              rotation
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
   * Positions around the perimeter of already-placed polygons
   */
  private generateCandidatePositions(bbox: any): Array<{x: number, y: number}> {
    const positions: Array<{x: number, y: number}> = [];

    // Top edge - drop from above
    const step = Math.max(bbox.width, 0.5);
    for (let x = 0; x <= this.sheetWidth - bbox.width; x += step) {
      positions.push({ x, y: 0 });
    }

    // Around placed polygon perimeters
    for (const placement of this.placements) {
      const placedBbox = geometryService.getBoundingBox(placement.points);

      // Try positions around this placed polygon
      positions.push(
        { x: placedBbox.maxX, y: placedBbox.minY },  // Right edge
        { x: placedBbox.minX - bbox.width, y: placedBbox.minY }, // Left edge
        { x: placedBbox.minX, y: placedBbox.maxY }, // Below
        { x: placedBbox.minX, y: placedBbox.minY - bbox.height } // Above
      );
    }

    return positions;
  }

  /**
   * "Drop" polygon using gravity - let it fall down and settle
   * Then slide it left until it touches something
   */
  private gravityDrop(
    preparedPoints: Point[],
    bbox: any,
    startX: number,
    startY: number,
    rotation: number
  ): { x: number, y: number, points: Point[] } | null {
    const slideStep = 0.05; // 0.05 inch steps
    let x = startX;
    let y = startY;

    // Phase 1: Drop down until collision or bottom
    while (y <= this.sheetHeight - bbox.height) {
      const translated = this.translatePolygon(preparedPoints, x, y, bbox);

      // Check bounds
      if (!CollisionDetector.isInBounds(translated, this.sheetWidth, this.sheetHeight)) {
        break;
      }

      // Check collision with placed polygons
      let hasCollision = false;
      for (const placed of this.placements) {
        if (CollisionDetector.hasCollision(translated, placed.points)) {
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

      // Check collision
      let hasCollision = false;
      for (const placed of this.placements) {
        if (CollisionDetector.hasCollision(translated, placed.points)) {
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

    for (const placed of this.placements) {
      if (CollisionDetector.hasCollision(finalTranslated, placed.points)) {
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
 */
export class MultiSheetNester {
  static async nestMultiSheet(
    polygons: NestablePolygon[],
    pageCount: number,
    sheetWidth: number,
    sheetHeight: number,
    spacing: number = 0.0625,
    rotations: number[] = [0, 90, 180, 270],
    packAllItems: boolean = true
  ): Promise<{
    sheets: Array<{ sheetIndex: number; placements: NestedPlacement[]; utilization: number }>;
    quantities: { [id: string]: number };
    totalUtilization: number;
    message?: string;
  }> {
    console.log(`\n=== Multi-Sheet Polygon Nesting ===`);
    console.log(`Unique designs: ${polygons.length}`);
    console.log(`Requested pages: ${pageCount}`);

    // Step 1: Generate candidate pool (Oversubscribe strategy)
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

    console.log(`Generated ${candidatePool.length} candidates`);

    // Step 2: Sort by area descending
    candidatePool.sort((a, b) => b.area - a.area);

    // Step 3: Pack sheets
    let currentPageCount = pageCount;
    const MAX_PAGES = 100;
    let allPlaced = false;
    let finalSheets: any[] = [];
    let finalQuantities: { [id: string]: number } = {};

    while (!allPlaced && currentPageCount <= MAX_PAGES) {
      const sheets: any[] = [];
      let remaining = [...candidatePool];

      for (let sheetIndex = 0; sheetIndex < currentPageCount && remaining.length > 0; sheetIndex++) {
        console.log(`\nPacking sheet ${sheetIndex + 1}/${currentPageCount}...`);

        const nester = new GravityNester(sheetWidth, sheetHeight, spacing, rotations);
        const result = await nester.nest(remaining);

        if (result.placements.length === 0) break;

        sheets.push({
          sheetIndex,
          placements: result.placements,
          utilization: result.utilization
        });

        // Remove placed items
        const placedIds = new Set(result.placements.map(p => p.id));
        remaining = remaining.filter(p => !placedIds.has(p.id));
      }

      // Calculate quantities
      const quantities: { [id: string]: number } = {};
      sheets.forEach(sheet => {
        sheet.placements.forEach((p: NestedPlacement) => {
          const originalId = p.id.replace(/_\d+$/, '');
          quantities[originalId] = (quantities[originalId] || 0) + 1;
        });
      });

      if (remaining.length === 0) {
        allPlaced = true;
        finalSheets = sheets;
        finalQuantities = quantities;
      } else if (packAllItems && currentPageCount < MAX_PAGES) {
        currentPageCount++;
      } else {
        finalSheets = sheets;
        finalQuantities = quantities;
        break;
      }
    }

    // Calculate total utilization
    const totalArea = sheetWidth * sheetHeight * finalSheets.length;
    let usedArea = 0;
    finalSheets.forEach(sheet => {
      sheet.placements.forEach((p: NestedPlacement) => {
        const originalId = p.id.replace(/_\d+$/, '');
        const original = polygons.find(poly => poly.id === originalId);
        if (original) usedArea += original.area;
      });
    });
    const totalUtilization = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;

    // Generate message
    let message: string | undefined;
    if (packAllItems && currentPageCount > pageCount) {
      message = `Auto-expanded from ${pageCount} to ${currentPageCount} pages`;
    }

    return {
      sheets: finalSheets,
      quantities: finalQuantities,
      totalUtilization,
      message
    };
  }
}
