/**
 * No-Fit Polygon (NFP) Based Nesting Service - FIXED IMPLEMENTATION
 *
 * Uses direct collision testing with dense position sampling
 * Simpler and more reliable than complex NFP edge-sliding
 */

import { Point } from './image.service';
import { GeometryService } from './geometry.service';

const geometryService = new GeometryService();

export interface NestablePolygon {
  id: string;
  points: Point[];
  width: number;
  height: number;
  area: number;
}

export interface NestedPlacement {
  id: string;
  x: number;
  y: number;
  rotation: number;
  points: Point[];
}

/**
 * Geometry utilities
 */
class GeometryUtils {
  static pointDistance(p1: Point, p2: Point): number {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  static translatePolygon(points: Point[], x: number, y: number): Point[] {
    return points.map(p => ({ x: p.x + x, y: p.y + y }));
  }

  static getPolygonBounds(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
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
 * NFP-based nester with robust position search
 */
export class NFPNester {
  private placements: NestedPlacement[] = [];

  constructor(
    private sheetWidth: number,
    private sheetHeight: number,
    private spacing: number = 0.0625,
    private rotations: number[] = [0, 90, 180, 270]
  ) {
    // CRITICAL: Use reduced spacing for collision to allow interlocking
    // Original spacing (e.g., 0.0625") destroys concave features needed for nesting
    // Use 10% of requested spacing for tight packing, expand shapes in final PDF
    this.actualPackingSpacing = Math.max(0.005, spacing * 0.1); // Min 0.005" gap
    console.log(`[NFP] Packing with reduced spacing=${this.actualPackingSpacing.toFixed(4)}" (requested ${spacing.toFixed(4)}")`);
  }

  private actualPackingSpacing: number;

  async nest(polygons: NestablePolygon[]): Promise<{
    placements: NestedPlacement[];
    utilization: number;
    unplacedPolygons: string[];
  }> {
    console.log(`\n=== NFP-Based Polygon Nesting (Fixed) ===`);
    console.log(`Items: ${polygons.length}`);
    console.log(`Sheet: ${this.sheetWidth.toFixed(1)}" × ${this.sheetHeight.toFixed(1)}"`);

    const unplaced: string[] = [];
    let itemNum = 0;

    for (const polygon of polygons) {
      itemNum++;

      const placement = await this.findBestPosition(polygon);

      if (placement) {
        this.placements.push(placement);
        console.log(`[${itemNum}/${polygons.length}] ✓ ${polygon.id} at (${placement.x.toFixed(2)}, ${placement.y.toFixed(2)}) rotation ${placement.rotation}°`);
      } else {
        unplaced.push(polygon.id);
        console.log(`[${itemNum}/${polygons.length}] ✗ ${polygon.id} - no valid position`);
      }
    }

    const sheetArea = this.sheetWidth * this.sheetHeight;
    const usedArea = this.placements.reduce((sum, p) => {
      const poly = polygons.find(pg => pg.id === p.id || p.id.startsWith(pg.id + '_'));
      return sum + (poly?.area || 0);
    }, 0);
    const utilization = (usedArea / sheetArea) * 100;

    console.log(`\n✓ Placed ${this.placements.length}/${polygons.length} items (${utilization.toFixed(1)}% utilization)`);

    return {
      placements: this.placements,
      utilization,
      unplacedPolygons: unplaced
    };
  }

  private async findBestPosition(polygon: NestablePolygon): Promise<NestedPlacement | null> {
    let bestPlacement: NestedPlacement | null = null;
    let bestScore = Infinity;

    let totalPositions = 0;
    let boundsRejections = 0;
    let collisionRejections = 0;

    // Try each rotation
    for (const rotation of this.rotations) {
      const rotated = rotation !== 0
        ? geometryService.rotatePoints(polygon.points, rotation)
        : polygon.points;

      // Apply MINIMAL spacing offset to allow interlocking
      const withMinimalSpacing = this.actualPackingSpacing > 0
        ? geometryService.offsetPolygon(rotated, this.actualPackingSpacing / 2)
        : rotated;

      const bbox = GeometryUtils.getPolygonBounds(withMinimalSpacing);
      const originalBbox = GeometryUtils.getPolygonBounds(rotated);

      // Log polygon size for first few placements
      if (this.placements.length <= 5 && rotation === 0) {
        console.log(`  [DEBUG] Item ${polygon.id}: bbox ${originalBbox.width.toFixed(2)}×${originalBbox.height.toFixed(2)} → ${bbox.width.toFixed(2)}×${bbox.height.toFixed(2)} (minimal spacing), ${rotated.length} vertices`);
      }

      // Generate candidate positions - DENSE GRID
      const positions = this.generateDenseCandidates(bbox);
      totalPositions += positions.length;

      // Test each position
      for (const pos of positions) {
        // Translate polygon with minimal spacing offset
        const translated = GeometryUtils.translatePolygon(
          withMinimalSpacing,
          pos.x - bbox.minX,
          pos.y - bbox.minY
        );

        // Check bounds
        if (!CollisionDetector.isInBounds(translated, this.sheetWidth, this.sheetHeight)) {
          boundsRejections++;
          continue;
        }

        // Check collisions with placed polygons (with minimal spacing)
        let hasCollision = false;
        for (const placed of this.placements) {
          const placedWithMinimalSpacing = this.actualPackingSpacing > 0
            ? geometryService.offsetPolygon(placed.points, this.actualPackingSpacing / 2)
            : placed.points;

          if (CollisionDetector.hasCollision(translated, placedWithMinimalSpacing)) {
            hasCollision = true;
            collisionRejections++;
            break;
          }
        }

        if (!hasCollision) {
          // Score: prefer bottom-left (row-first packing)
          const score = pos.y * 100 + pos.x;

          if (score < bestScore) {
            bestScore = score;

            // Store with ORIGINAL polygon (no spacing offset)
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

    // Log rejection stats for failed placements
    if (!bestPlacement) {
      console.log(`  [DEBUG] ${polygon.id} FAILED: tested ${totalPositions} positions, ${boundsRejections} bounds fails, ${collisionRejections} collision fails`);
    }

    return bestPlacement;
  }

  /**
   * Generate candidate positions using multi-strategy approach:
   * 1. Edge-touching positions (highest priority - tight packing)
   * 2. Fine grid near placed items (0.02" for tight fitting)
   * 3. Coarse grid across sheet (0.1" for general exploration)
   */
  private generateDenseCandidates(bbox: any): Point[] {
    const positions = new Set<string>(); // Use set to avoid duplicates
    const coarseStep = 0.1;  // Coarse grid for general exploration
    const fineStep = 0.02;   // Fine grid near placed items for tight fits
    const margin = 0.5;      // Search this far around placed items with fine grid

    // 1. EDGE-TOUCHING positions (highest priority)
    // Test positions where new item touches edges of placed items
    for (const placed of this.placements) {
      const placedBbox = GeometryUtils.getPolygonBounds(placed.points);

      // Right edge of placed item
      const rightX = placedBbox.maxX - bbox.minX;
      if (rightX >= -bbox.minX && rightX <= this.sheetWidth - bbox.maxX) {
        // Try multiple Y positions along the edge
        for (let y = Math.max(-bbox.minY, placedBbox.minY - bbox.height);
             y <= Math.min(this.sheetHeight - bbox.maxY, placedBbox.maxY);
             y += fineStep) {
          positions.add(`${rightX.toFixed(3)},${y.toFixed(3)}`);
        }
      }

      // Top edge of placed item
      const topY = placedBbox.maxY - bbox.minY;
      if (topY >= -bbox.minY && topY <= this.sheetHeight - bbox.maxY) {
        // Try multiple X positions along the edge
        for (let x = Math.max(-bbox.minX, placedBbox.minX - bbox.width);
             x <= Math.min(this.sheetWidth - bbox.maxX, placedBbox.maxX);
             x += fineStep) {
          positions.add(`${x.toFixed(3)},${topY.toFixed(3)}`);
        }
      }

      // Left edge of placed item (less priority, but sometimes useful)
      const leftX = placedBbox.minX - bbox.maxX;
      if (leftX >= -bbox.minX && leftX <= this.sheetWidth - bbox.maxX) {
        for (let y = Math.max(-bbox.minY, placedBbox.minY - bbox.height);
             y <= Math.min(this.sheetHeight - bbox.maxY, placedBbox.maxY);
             y += coarseStep) {
          positions.add(`${leftX.toFixed(3)},${y.toFixed(3)}`);
        }
      }

      // Bottom edge of placed item (less priority)
      const bottomY = placedBbox.minY - bbox.maxY;
      if (bottomY >= -bbox.minY && bottomY <= this.sheetHeight - bbox.maxY) {
        for (let x = Math.max(-bbox.minX, placedBbox.minX - bbox.width);
             x <= Math.min(this.sheetWidth - bbox.maxX, placedBbox.maxX);
             x += coarseStep) {
          positions.add(`${x.toFixed(3)},${bottomY.toFixed(3)}`);
        }
      }
    }

    // 2. Fine grid near placed items (tight fitting)
    for (const placed of this.placements) {
      const placedBbox = GeometryUtils.getPolygonBounds(placed.points);

      // Fine grid around this placed item
      const minY = Math.max(-bbox.minY, placedBbox.minY - margin);
      const maxY = Math.min(this.sheetHeight - bbox.maxY, placedBbox.maxY + margin);
      const minX = Math.max(-bbox.minX, placedBbox.minX - margin);
      const maxX = Math.min(this.sheetWidth - bbox.maxX, placedBbox.maxX + margin);

      for (let y = minY; y <= maxY; y += fineStep) {
        for (let x = minX; x <= maxX; x += fineStep) {
          positions.add(`${x.toFixed(3)},${y.toFixed(3)}`);
        }
      }
    }

    // 3. Coarse grid across entire sheet (general exploration)
    for (let y = -bbox.minY; y <= this.sheetHeight - bbox.maxY; y += coarseStep) {
      for (let x = -bbox.minX; x <= this.sheetWidth - bbox.maxX; x += coarseStep) {
        positions.add(`${x.toFixed(3)},${y.toFixed(3)}`);
      }
    }

    // 4. Convert set to array of points
    const pointsArray = Array.from(positions).map(key => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });

    // Sort by bottom-left preference (prioritizes tight packing)
    pointsArray.sort((a, b) => (a.y * 100 + a.x) - (b.y * 100 + b.x));

    return pointsArray;
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
    console.log(`\n=== Multi-Sheet NFP Nesting (Fixed) ===`);
    console.log(`Unique designs: ${polygons.length}`);
    console.log(`Requested pages: ${pageCount}`);

    // Oversubscribe strategy
    const targetArea = pageCount * sheetWidth * sheetHeight;
    const candidatePool: NestablePolygon[] = [];
    const instanceCounts: { [id: string]: number } = {};
    polygons.forEach(p => instanceCounts[p.id] = 0);

    let currentArea = 0;
    let index = 0;

    while (currentArea < targetArea * 1.20) { // 20% oversubscribe
      const original = polygons[index % polygons.length];
      const instanceId = `${original.id}_${instanceCounts[original.id]}`;
      instanceCounts[original.id]++;

      candidatePool.push({ ...original, id: instanceId });
      currentArea += original.area;
      index++;
    }

    console.log(`Generated ${candidatePool.length} candidates (20% oversubscribed)`);

    // Sort by composite score: area × complexity (vertex count)
    // This prioritizes large, complex shapes that are harder to place
    candidatePool.sort((a, b) => {
      const scoreA = a.area * Math.sqrt(a.points.length);
      const scoreB = b.area * Math.sqrt(b.points.length);
      return scoreB - scoreA;
    });

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

      console.log(`  Sheet complete: ${result.placements.length} items, ${remaining.length} remaining`);
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
