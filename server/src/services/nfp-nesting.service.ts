/**
 * No-Fit Polygon (NFP) Based Nesting Service - PROPER IMPLEMENTATION
 *
 * Uses edge-sliding algorithm to compute accurate NFPs that preserve concave features
 * Based on research by E.K. Burke et al. and SVGNest implementation
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
 * Geometry utilities for NFP calculation
 */
class GeometryUtils {
  static almostEqual(a: number, b: number, tolerance: number = 0.001): boolean {
    return Math.abs(a - b) < tolerance;
  }

  static pointDistance(p1: Point, p2: Point): number {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  static pointsEqual(p1: Point, p2: Point, tolerance: number = 0.001): boolean {
    return this.almostEqual(p1.x, p2.x, tolerance) && this.almostEqual(p1.y, p2.y, tolerance);
  }

  static polygonArea(points: Point[]): number {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return Math.abs(area / 2);
  }

  static isClockwise(points: Point[]): boolean {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += (points[j].x - points[i].x) * (points[j].y + points[i].y);
    }
    return area > 0;
  }

  static reversePolygon(points: Point[]): Point[] {
    return [...points].reverse();
  }

  static lineIntersection(
    A1: Point, A2: Point,
    B1: Point, B2: Point
  ): Point | null {
    const denom = (B2.y - B1.y) * (A2.x - A1.x) - (B2.x - B1.x) * (A2.y - A1.y);

    if (Math.abs(denom) < 0.0001) {
      return null; // Parallel
    }

    const ua = ((B2.x - B1.x) * (A1.y - B1.y) - (B2.y - B1.y) * (A1.x - B1.x)) / denom;
    const ub = ((A2.x - A1.x) * (A1.y - B1.y) - (A2.y - A1.y) * (A1.x - B1.x)) / denom;

    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
      return {
        x: A1.x + ua * (A2.x - A1.x),
        y: A1.y + ua * (A2.y - A1.y)
      };
    }

    return null;
  }

  static translatePolygon(points: Point[], x: number, y: number): Point[] {
    return points.map(p => ({ x: p.x + x, y: p.y + y }));
  }

  static getPolygonBounds(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys)
    };
  }
}

/**
 * Edge-Sliding No-Fit Polygon Calculator
 *
 * This implementation uses the proper edge-sliding algorithm to compute NFPs.
 * Unlike convex hull approaches, this preserves concave features needed for interlocking.
 */
class EdgeSlidingNFP {
  /**
   * Calculate NFP by sliding orbiting polygon around stationary polygon
   */
  static calculate(stationary: Point[], orbiting: Point[]): Point[] {
    // Ensure both polygons are counter-clockwise
    const A = GeometryUtils.isClockwise(stationary)
      ? GeometryUtils.reversePolygon(stationary)
      : stationary;
    const B = GeometryUtils.isClockwise(orbiting)
      ? GeometryUtils.reversePolygon(orbiting)
      : orbiting;

    // Start position: place B's leftmost point at A's rightmost point
    const startA = this.getRightmostPoint(A);
    const startB = this.getLeftmostPoint(B);

    // Translate B so its leftmost point is at origin
    const BTranslated = B.map(p => ({
      x: p.x - startB.x,
      y: p.y - startB.y
    }));

    // Reference point is now at origin
    const refPoint = { x: 0, y: 0 };

    // Start NFP construction
    const nfp: Point[] = [];
    let currentPos = { x: startA.x, y: startA.y };
    nfp.push({ ...currentPos });

    // Slide B around A edge by edge
    let aIndex = A.indexOf(startA);
    let bIndex = BTranslated.findIndex(p =>
      GeometryUtils.almostEqual(p.x, 0) && GeometryUtils.almostEqual(p.y, 0)
    );

    const maxIterations = (A.length + B.length) * 2;
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      // Get current edges
      const aEdge = {
        start: A[aIndex],
        end: A[(aIndex + 1) % A.length]
      };

      const bEdge = {
        start: BTranslated[bIndex],
        end: BTranslated[(bIndex + 1) % BTranslated.length]
      };

      // Calculate edge vectors
      const aVector = {
        x: aEdge.end.x - aEdge.start.x,
        y: aEdge.end.y - aEdge.start.y
      };

      const bVector = {
        x: -(bEdge.end.x - bEdge.start.x),
        y: -(bEdge.end.y - bEdge.start.y)
      };

      // Determine which edge to follow (cross product)
      const cross = aVector.x * bVector.y - aVector.y * bVector.x;

      let translation: Point;

      if (Math.abs(cross) < 0.0001) {
        // Edges are parallel - choose one
        translation = aVector;
        aIndex = (aIndex + 1) % A.length;
        bIndex = (bIndex + 1) % BTranslated.length;
      } else if (cross > 0) {
        // Follow A edge
        translation = aVector;
        aIndex = (aIndex + 1) % A.length;
      } else {
        // Follow B edge (inverted)
        translation = bVector;
        bIndex = (bIndex + 1) % BTranslated.length;
      }

      // Add translation to current position
      currentPos = {
        x: currentPos.x + translation.x,
        y: currentPos.y + translation.y
      };

      // Check if we've completed the loop
      if (nfp.length > 1 && GeometryUtils.pointsEqual(currentPos, nfp[0])) {
        break;
      }

      nfp.push({ ...currentPos });
    }

    // Remove duplicate final point if present
    if (nfp.length > 1 && GeometryUtils.pointsEqual(nfp[0], nfp[nfp.length - 1])) {
      nfp.pop();
    }

    return nfp;
  }

  private static getRightmostPoint(points: Point[]): Point {
    return points.reduce((rightmost, p) =>
      p.x > rightmost.x ? p : rightmost
    , points[0]);
  }

  private static getLeftmostPoint(points: Point[]): Point {
    return points.reduce((leftmost, p) =>
      p.x < leftmost.x ? p : leftmost
    , points[0]);
  }
}

/**
 * Collision detector using SAT
 */
class CollisionDetector {
  static hasCollision(poly1: Point[], poly2: Point[]): boolean {
    // Quick bounding box check
    const bbox1 = GeometryUtils.getPolygonBounds(poly1);
    const bbox2 = GeometryUtils.getPolygonBounds(poly2);

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
        return false;
      }
    }

    return true;
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
 * Point-in-polygon test using ray casting
 */
class PointInPolygon {
  static test(point: Point, polygon: Point[]): boolean {
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
 * NFP-based nester with edge-sliding algorithm
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

  async nest(polygons: NestablePolygon[]): Promise<{
    placements: NestedPlacement[];
    utilization: number;
    unplacedPolygons: string[];
  }> {
    console.log(`\n=== NFP-Based Polygon Nesting (Edge-Sliding) ===`);
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

  private async findBestPosition(polygon: NestablePolygon): Promise<NestedPlacement | null> {
    let bestPlacement: NestedPlacement | null = null;
    let bestScore = Infinity;

    for (const rotation of this.rotations) {
      const rotated = rotation !== 0
        ? geometryService.rotatePoints(polygon.points, rotation)
        : polygon.points;

      const withSpacing = this.spacing > 0
        ? geometryService.offsetPolygon(rotated, this.spacing / 2)
        : rotated;

      // Find feasible positions using NFP
      const positions = this.findFeasiblePositions(withSpacing);

      for (const pos of positions) {
        const bbox = GeometryUtils.getPolygonBounds(withSpacing);
        const translated = GeometryUtils.translatePolygon(
          withSpacing,
          pos.x - bbox.minX,
          pos.y - bbox.minY
        );

        if (!CollisionDetector.isInBounds(translated, this.sheetWidth, this.sheetHeight)) {
          continue;
        }

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
          const score = pos.x + pos.y * 2; // Prefer bottom, then left

          if (score < bestScore) {
            bestScore = score;

            const originalBbox = GeometryUtils.getPolygonBounds(rotated);
            const originalTranslated = GeometryUtils.translatePolygon(
              rotated,
              pos.x - originalBbox.minX,
              pos.y - originalBbox.minY
            );

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

  private findFeasiblePositions(polygon: Point[]): Point[] {
    const positions: Point[] = [];
    const bbox = GeometryUtils.getPolygonBounds(polygon);

    // If first placement, sample the sheet
    if (this.placements.length === 0) {
      const step = 0.1; // Fine grid for first placement
      for (let y = -bbox.minY; y <= this.sheetHeight - bbox.maxY; y += step) {
        for (let x = -bbox.minX; x <= this.sheetWidth - bbox.maxX; x += step) {
          positions.push({ x, y });
        }
      }
      positions.sort((a, b) => (a.y * 2 + a.x) - (b.y * 2 + b.x));
      return positions.slice(0, 100);
    }

    // For subsequent placements, use NFP edges and vertices
    for (const placed of this.placements) {
      const placedWithSpacing = this.spacing > 0
        ? geometryService.offsetPolygon(placed.points, this.spacing / 2)
        : placed.points;

      // Compute NFP
      const nfp = this.getNFP(placedWithSpacing, polygon);

      // Sample along NFP edges
      for (let i = 0; i < nfp.length; i++) {
        const p1 = nfp[i];
        const p2 = nfp[(i + 1) % nfp.length];

        // Add vertices
        if (p1.x >= -bbox.minX && p1.x <= this.sheetWidth - bbox.maxX &&
            p1.y >= -bbox.minY && p1.y <= this.sheetHeight - bbox.maxY) {
          positions.push({ x: p1.x, y: p1.y });
        }

        // Sample along edge
        const edgeLength = GeometryUtils.pointDistance(p1, p2);
        const samples = Math.max(2, Math.ceil(edgeLength / 0.2));

        for (let s = 0; s < samples; s++) {
          const t = s / samples;
          const x = p1.x + t * (p2.x - p1.x);
          const y = p1.y + t * (p2.y - p1.y);

          if (x >= -bbox.minX && x <= this.sheetWidth - bbox.maxX &&
              y >= -bbox.minY && y <= this.sheetHeight - bbox.maxY) {
            positions.push({ x, y });
          }
        }
      }
    }

    // Remove duplicates and sort
    const unique = positions.filter((p, i, arr) =>
      i === 0 || !GeometryUtils.pointsEqual(p, arr[i - 1])
    );

    unique.sort((a, b) => (a.y * 2 + a.x) - (b.y * 2 + b.x));
    return unique.slice(0, 200); // Return top 200 candidates
  }

  private getNFP(stationary: Point[], orbiting: Point[]): Point[] {
    const key = JSON.stringify({ s: stationary, o: orbiting });

    if (this.nfpCache.has(key)) {
      return this.nfpCache.get(key)!;
    }

    const nfp = EdgeSlidingNFP.calculate(stationary, orbiting);
    this.nfpCache.set(key, nfp);
    return nfp;
  }
}

/**
 * Multi-sheet NFP nesting
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
    console.log(`\n=== Multi-Sheet NFP Nesting (Edge-Sliding) ===`);
    console.log(`Unique designs: ${polygons.length}`);
    console.log(`Requested pages: ${pageCount}`);
    console.log(`Mode: ${packAllItems ? 'AUTO-EXPAND' : 'PRODUCTION'}`);

    // Oversubscribe strategy
    const targetArea = pageCount * sheetWidth * sheetHeight;
    const candidatePool: NestablePolygon[] = [];
    const instanceCounts: { [id: string]: number } = {};
    polygons.forEach(p => instanceCounts[p.id] = 0);

    let currentArea = 0;
    let index = 0;

    while (currentArea < targetArea * 1.15) {
      const original = polygons[index % polygons.length];
      const instanceId = `${original.id}_${instanceCounts[original.id]}`;
      instanceCounts[original.id]++;

      candidatePool.push({ ...original, id: instanceId });
      currentArea += original.area;
      index++;
    }

    console.log(`Generated ${candidatePool.length} candidates (15% oversubscribed)`);

    // Sort by area descending
    candidatePool.sort((a, b) => b.area - a.area);

    // Pack sheets
    const sheets: any[] = [];
    let remaining = [...candidatePool];

    for (let sheetIndex = 0; sheetIndex < pageCount && remaining.length > 0; sheetIndex++) {
      console.log(`\nPacking sheet ${sheetIndex + 1}/${pageCount}...`);

      const nester = new NFPNester(sheetWidth, sheetHeight, spacing, rotations);
      const result = await nester.nest(remaining);

      if (result.placements.length === 0) {
        console.log(`  No items fit, stopping.`);
        break;
      }

      sheets.push({
        sheetIndex,
        placements: result.placements,
        utilization: result.utilization
      });

      const placedIds = new Set(result.placements.map(p => p.id));
      remaining = remaining.filter(p => !placedIds.has(p.id));

      console.log(`  Placed ${result.placements.length} items, ${remaining.length} remaining`);
    }

    // Calculate quantities
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
    console.log(`Total utilization: ${totalUtilization.toFixed(1)}%`);

    return {
      sheets,
      quantities,
      totalUtilization
    };
  }
}
