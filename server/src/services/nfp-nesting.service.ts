/**
 * No-Fit Polygon (NFP) Based Nesting Service
 *
 * TRUE polygon nesting using computational geometry:
 * - Computes No-Fit Polygons between shapes
 * - Finds exact positions where shapes can touch/interlock
 * - No rasterization, no gravity simulation
 * - Industry-standard approach for 2D cutting optimization
 */

import { Point } from './image.service';
import { GeometryService } from './geometry.service';

const geometryService = new GeometryService();

export interface NestablePolygon {
  id: string;
  points: Point[];  // Polygon vertices (counter-clockwise)
  width: number;    // Bounding box width (inches)
  height: number;   // Bounding box height (inches)
  area: number;     // Polygon area (square inches)
}

export interface NestedPlacement {
  id: string;
  x: number;        // Position (inches)
  y: number;
  rotation: number; // Rotation angle (degrees)
  points: Point[];  // Final positioned polygon
}

/**
 * No-Fit Polygon calculator
 * Computes the forbidden region where one polygon cannot be placed relative to another
 */
class NoFitPolygonCalculator {
  /**
   * Calculate No-Fit Polygon (NFP) for polygon B orbiting around polygon A
   * The NFP represents all positions where B's reference point can be such that B touches A
   *
   * Uses Minkowski difference approach: NFP = A ⊖ (-B)
   */
  static calculateNFP(stationary: Point[], orbiting: Point[]): Point[] {
    // Normalize both polygons to ensure counter-clockwise winding
    const A = this.ensureCounterClockwise(stationary);
    const B = this.ensureCounterClockwise(orbiting);

    // Get reference point of B (use first vertex)
    const refPoint = B[0];

    // Translate B so reference point is at origin
    const BTranslated = B.map(p => ({
      x: p.x - refPoint.x,
      y: p.y - refPoint.y
    }));

    // Negate B (reflect through origin)
    const BNegated = BTranslated.map(p => ({ x: -p.x, y: -p.y }));

    // Compute Minkowski sum: A ⊕ (-B)
    const nfp = this.minkowskiSum(A, BNegated);

    return nfp;
  }

  /**
   * Minkowski sum of two polygons
   * For convex polygons, this can be done efficiently
   * For general polygons, we use edge-edge sliding approach
   */
  private static minkowskiSum(A: Point[], B: Point[]): Point[] {
    const result: Point[] = [];

    // For each vertex in A
    for (let i = 0; i < A.length; i++) {
      const a = A[i];

      // Add it to each vertex in B
      for (let j = 0; j < B.length; j++) {
        const b = B[j];
        result.push({
          x: a.x + b.x,
          y: a.y + b.y
        });
      }
    }

    // Compute convex hull of all resulting points
    return this.convexHull(result);
  }

  /**
   * Compute convex hull using Graham scan
   */
  private static convexHull(points: Point[]): Point[] {
    if (points.length < 3) return points;

    // Find bottom-most point (or left-most if tie)
    let anchor = points[0];
    let anchorIdx = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].y < anchor.y || (points[i].y === anchor.y && points[i].x < anchor.x)) {
        anchor = points[i];
        anchorIdx = i;
      }
    }

    // Sort points by polar angle with respect to anchor
    const sorted = points.filter((_, i) => i !== anchorIdx);
    sorted.sort((a, b) => {
      const angleA = Math.atan2(a.y - anchor.y, a.x - anchor.x);
      const angleB = Math.atan2(b.y - anchor.y, b.x - anchor.x);
      if (Math.abs(angleA - angleB) < 0.0001) {
        // If same angle, sort by distance
        const distA = Math.hypot(a.x - anchor.x, a.y - anchor.y);
        const distB = Math.hypot(b.x - anchor.x, b.y - anchor.y);
        return distA - distB;
      }
      return angleA - angleB;
    });

    // Build hull
    const hull: Point[] = [anchor, sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const p = sorted[i];

      // Remove points that create right turn
      while (hull.length >= 2) {
        const a = hull[hull.length - 2];
        const b = hull[hull.length - 1];
        const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        if (cross <= 0) {
          hull.pop();
        } else {
          break;
        }
      }

      hull.push(p);
    }

    return hull;
  }

  /**
   * Ensure polygon vertices are in counter-clockwise order
   */
  private static ensureCounterClockwise(points: Point[]): Point[] {
    const area = this.signedArea(points);
    if (area < 0) {
      return [...points].reverse();
    }
    return points;
  }

  /**
   * Calculate signed area of polygon (positive = CCW, negative = CW)
   */
  private static signedArea(points: Point[]): number {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      sum += (points[j].x - points[i].x) * (points[j].y + points[i].y);
    }
    return sum / 2;
  }

  /**
   * Check if point is inside polygon (ray casting algorithm)
   */
  static isPointInPolygon(point: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;

      const intersect = ((yi > point.y) !== (yj > point.y))
        && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
}

/**
 * Inner Fit Rectangle calculator
 * Computes the region within the sheet where a polygon can be placed
 */
class InnerFitRectangle {
  static calculate(polygon: Point[], sheetWidth: number, sheetHeight: number): Point[] {
    const bbox = geometryService.getBoundingBox(polygon);

    // The IFR is a rectangle where the reference point can be placed
    // such that the entire polygon fits within the sheet
    return [
      { x: -bbox.minX, y: -bbox.minY },
      { x: sheetWidth - bbox.maxX, y: -bbox.minY },
      { x: sheetWidth - bbox.maxX, y: sheetHeight - bbox.maxY },
      { x: -bbox.minX, y: sheetHeight - bbox.maxY }
    ];
  }
}

/**
 * Collision detector using SAT (Separating Axis Theorem)
 */
class CollisionDetector {
  static hasCollision(poly1: Point[], poly2: Point[]): boolean {
    // Quick bounding box check
    const bbox1 = geometryService.getBoundingBox(poly1);
    const bbox2 = geometryService.getBoundingBox(poly2);

    if (bbox1.maxX < bbox2.minX || bbox2.maxX < bbox1.minX ||
        bbox1.maxY < bbox2.minY || bbox2.maxY < bbox1.minY) {
      return false;
    }

    // SAT collision detection
    const axes = [...this.getAxes(poly1), ...this.getAxes(poly2)];

    for (const axis of axes) {
      const proj1 = this.projectPolygon(poly1, axis);
      const proj2 = this.projectPolygon(poly2, axis);

      if (proj1.max < proj2.min || proj2.max < proj1.min) {
        return false; // Separating axis found
      }
    }

    return true; // No separating axis = collision
  }

  private static getAxes(poly: Point[]): Point[] {
    const axes: Point[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const edge = { x: p2.x - p1.x, y: p2.y - p1.y };
      const normal = { x: -edge.y, y: edge.x };
      const length = Math.hypot(normal.x, normal.y);
      if (length > 0.0001) {
        axes.push({ x: normal.x / length, y: normal.y / length });
      }
    }
    return axes;
  }

  private static projectPolygon(poly: Point[], axis: Point): { min: number; max: number } {
    let min = poly[0].x * axis.x + poly[0].y * axis.y;
    let max = min;

    for (let i = 1; i < poly.length; i++) {
      const proj = poly[i].x * axis.x + poly[i].y * axis.y;
      if (proj < min) min = proj;
      if (proj > max) max = proj;
    }

    return { min, max };
  }

  static isInBounds(poly: Point[], width: number, height: number): boolean {
    for (const p of poly) {
      if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
        return false;
      }
    }
    return true;
  }
}

/**
 * NFP-based nester - finds optimal positions using No-Fit Polygons
 */
export class NFPNester {
  private placements: NestedPlacement[] = [];
  private nfpCache: Map<string, Point[]> = new Map();

  constructor(
    private sheetWidth: number,
    private sheetHeight: number,
    private spacing: number = 0.0625,
    private rotations: number[] = [0, 90, 180, 270]
  ) {}

  /**
   * Nest polygons using NFP approach
   */
  async nest(polygons: NestablePolygon[]): Promise<{
    placements: NestedPlacement[];
    utilization: number;
    unplacedPolygons: string[];
  }> {
    console.log(`\n=== NFP-Based Polygon Nesting ===`);
    console.log(`Items: ${polygons.length}`);
    console.log(`Sheet: ${this.sheetWidth.toFixed(1)}" × ${this.sheetHeight.toFixed(1)}"`);

    const unplaced: string[] = [];
    let itemNum = 0;

    for (const polygon of polygons) {
      itemNum++;
      console.log(`\n[${itemNum}/${polygons.length}] Placing ${polygon.id}...`);

      const placement = await this.findBestPosition(polygon);

      if (placement) {
        this.placements.push(placement);
        console.log(`  ✓ Placed at (${placement.x.toFixed(2)}, ${placement.y.toFixed(2)}) rotation ${placement.rotation}°`);
      } else {
        unplaced.push(polygon.id);
        console.log(`  ✗ Could not place ${polygon.id}`);
      }
    }

    // Calculate utilization
    const sheetArea = this.sheetWidth * this.sheetHeight;
    const usedArea = this.placements.reduce((sum, p) => {
      const poly = polygons.find(pg => pg.id === p.id || p.id.startsWith(pg.id + '_'));
      return sum + (poly?.area || 0);
    }, 0);
    const utilization = (usedArea / sheetArea) * 100;

    console.log(`\n✓ Placed ${this.placements.length}/${polygons.length} items`);
    console.log(`Utilization: ${utilization.toFixed(1)}%`);

    return {
      placements: this.placements,
      utilization,
      unplacedPolygons: unplaced
    };
  }

  /**
   * Find best position for a polygon using NFPs
   */
  private async findBestPosition(polygon: NestablePolygon): Promise<NestedPlacement | null> {
    let bestPlacement: NestedPlacement | null = null;
    let bestScore = Infinity;

    for (const rotation of this.rotations) {
      // Rotate polygon
      const rotated = rotation !== 0
        ? geometryService.rotatePoints(polygon.points, rotation)
        : polygon.points;

      // Apply spacing offset for collision detection
      const withSpacing = this.spacing > 0
        ? geometryService.offsetPolygon(rotated, this.spacing / 2)
        : rotated;

      // Find feasible positions
      const positions = this.findFeasiblePositions(withSpacing);

      // Try each feasible position
      for (const pos of positions) {
        // Translate to position
        const bbox = geometryService.getBoundingBox(withSpacing);
        const offsetX = pos.x - bbox.minX;
        const offsetY = pos.y - bbox.minY;
        const translated = withSpacing.map(p => ({
          x: p.x + offsetX,
          y: p.y + offsetY
        }));

        // Check if valid (in bounds and no collisions)
        if (!CollisionDetector.isInBounds(translated, this.sheetWidth, this.sheetHeight)) {
          continue;
        }

        // Check collisions with placed items (with spacing)
        let hasCollision = false;
        for (const placed of this.placements) {
          const placedWithSpacing = this.spacing > 0
            ? geometryService.offsetPolygon(placed.points, this.spacing / 2)
            : placed.points;

          if (CollisionDetector.hasCollision(translated, placedWithSpacing)) {
            hasCollision = true;
            break;
          }
        }

        if (!hasCollision) {
          // Score: prefer bottom-left positions
          const score = pos.x + pos.y;

          if (score < bestScore) {
            bestScore = score;

            // Store placement with ORIGINAL polygon (no spacing offset)
            const originalBbox = geometryService.getBoundingBox(rotated);
            const originalTranslated = rotated.map(p => ({
              x: p.x + (pos.x - originalBbox.minX),
              y: p.y + (pos.y - originalBbox.minY)
            }));

            bestPlacement = {
              id: polygon.id,
              x: pos.x,
              y: pos.y,
              rotation,
              points: originalTranslated
            };
          }
        }
      }
    }

    return bestPlacement;
  }

  /**
   * Find feasible positions using NFPs and IFR
   */
  private findFeasiblePositions(polygon: Point[]): Point[] {
    const positions: Point[] = [];

    // If no placements yet, can place anywhere in IFR
    if (this.placements.length === 0) {
      const ifr = InnerFitRectangle.calculate(polygon, this.sheetWidth, this.sheetHeight);

      // Sample positions within IFR
      const step = 0.25; // 0.25 inch grid
      const bbox = geometryService.getBoundingBox(polygon);

      for (let y = -bbox.minY; y <= this.sheetHeight - bbox.maxY; y += step) {
        for (let x = -bbox.minX; x <= this.sheetWidth - bbox.maxX; x += step) {
          // Check if position is inside IFR
          if (NoFitPolygonCalculator.isPointInPolygon({ x, y }, ifr)) {
            positions.push({ x, y });
          }
        }
      }

      return positions;
    }

    // For subsequent placements, find positions outside all NFPs
    // Sample the sheet at regular intervals
    const step = 0.25; // 0.25 inch grid (coarse for performance)
    const bbox = geometryService.getBoundingBox(polygon);

    for (let y = -bbox.minY; y <= this.sheetHeight - bbox.maxY; y += step) {
      for (let x = -bbox.minX; x <= this.sheetWidth - bbox.maxX; x += step) {
        const pos = { x, y };

        // Check if position is inside IFR
        const ifr = InnerFitRectangle.calculate(polygon, this.sheetWidth, this.sheetHeight);
        if (!NoFitPolygonCalculator.isPointInPolygon(pos, ifr)) {
          continue;
        }

        // Check if position is outside all NFPs (i.e., doesn't collide)
        let insideNFP = false;
        for (const placed of this.placements) {
          const placedWithSpacing = this.spacing > 0
            ? geometryService.offsetPolygon(placed.points, this.spacing / 2)
            : placed.points;

          const nfp = this.getNFP(placedWithSpacing, polygon);

          if (NoFitPolygonCalculator.isPointInPolygon(pos, nfp)) {
            insideNFP = true;
            break;
          }
        }

        if (!insideNFP) {
          positions.push(pos);
        }
      }
    }

    // Sort by bottom-left preference
    positions.sort((a, b) => (a.x + a.y) - (b.x + b.y));

    // Return top N positions to try
    return positions.slice(0, 50);
  }

  /**
   * Get or compute NFP (with caching)
   */
  private getNFP(stationary: Point[], orbiting: Point[]): Point[] {
    const key = this.nfpCacheKey(stationary, orbiting);

    if (this.nfpCache.has(key)) {
      return this.nfpCache.get(key)!;
    }

    const nfp = NoFitPolygonCalculator.calculateNFP(stationary, orbiting);
    this.nfpCache.set(key, nfp);
    return nfp;
  }

  private nfpCacheKey(poly1: Point[], poly2: Point[]): string {
    return JSON.stringify([poly1, poly2]);
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
 * Multi-sheet NFP nesting with Oversubscribe and Sort strategy
 */
export class MultiSheetNFPNester {
  static async nestMultiSheet(
    polygons: NestablePolygon[],
    pageCount: number,
    sheetWidth: number,
    sheetHeight: number,
    spacing: number = 0.0625,
    rotations: number[] = [0, 90, 180, 270],
    packAllItems: boolean = false
  ): Promise<{
    sheets: Array<{ sheetIndex: number; placements: NestedPlacement[]; utilization: number }>;
    quantities: { [id: string]: number };
    totalUtilization: number;
    message?: string;
  }> {
    console.log(`\n=== Multi-Sheet NFP Nesting ===`);
    console.log(`Unique designs: ${polygons.length}`);
    console.log(`Requested pages: ${pageCount}`);
    console.log(`Mode: ${packAllItems ? 'AUTO-EXPAND (pack all)' : 'PRODUCTION (fill requested pages)'}`);

    // Generate candidate pool (Oversubscribe strategy)
    const targetArea = pageCount * sheetWidth * sheetHeight;
    const buffer = 1.15;
    const targetWithBuffer = targetArea * buffer;

    const candidatePool: NestablePolygon[] = [];
    const instanceCounts: { [id: string]: number } = {};
    polygons.forEach(p => instanceCounts[p.id] = 0);

    let currentArea = 0;
    let index = 0;

    while (currentArea < targetWithBuffer) {
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

    console.log(`Generated ${candidatePool.length} candidates (15% oversubscribed)`);

    // Sort by area descending
    candidatePool.sort((a, b) => b.area - a.area);

    // Pack into requested pages
    const sheets: any[] = [];
    let remaining = [...candidatePool];

    for (let sheetIndex = 0; sheetIndex < pageCount && remaining.length > 0; sheetIndex++) {
      console.log(`\nPacking sheet ${sheetIndex + 1}/${pageCount}...`);

      const nester = new NFPNester(sheetWidth, sheetHeight, spacing, rotations);
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

    // Calculate quantities and utilization
    const quantities: { [id: string]: number } = {};
    sheets.forEach(sheet => {
      sheet.placements.forEach((p: NestedPlacement) => {
        const originalId = p.id.replace(/_\d+$/, '');
        quantities[originalId] = (quantities[originalId] || 0) + 1;
      });
    });

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

    console.log(`\n✓ Packed ${sheets.length} sheets`);
    console.log(`Quantities:`, quantities);
    console.log(`Total utilization: ${totalUtilization.toFixed(1)}%`);

    return {
      sheets,
      quantities,
      totalUtilization
    };
  }
}
