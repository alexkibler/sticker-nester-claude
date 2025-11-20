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
  ) {}

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

    // Try each rotation
    for (const rotation of this.rotations) {
      const rotated = rotation !== 0
        ? geometryService.rotatePoints(polygon.points, rotation)
        : polygon.points;

      // Apply spacing for collision detection
      const withSpacing = this.spacing > 0
        ? geometryService.offsetPolygon(rotated, this.spacing / 2)
        : rotated;

      const bbox = GeometryUtils.getPolygonBounds(withSpacing);

      // Generate candidate positions - DENSE GRID
      const positions = this.generateDenseCandidates(bbox);

      // Test each position
      for (const pos of positions) {
        // Translate polygon to test position
        const translated = GeometryUtils.translatePolygon(
          withSpacing,
          pos.x - bbox.minX,
          pos.y - bbox.minY
        );

        // Check bounds
        if (!CollisionDetector.isInBounds(translated, this.sheetWidth, this.sheetHeight)) {
          continue;
        }

        // Check collisions with placed polygons
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
          // Score: prefer bottom-left (row-first packing)
          const score = pos.y * 100 + pos.x;

          if (score < bestScore) {
            bestScore = score;

            // Store with original polygon (no spacing)
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

  /**
   * Generate dense grid of candidate positions
   * Uses smart sampling: denser near placed items, coarser in empty areas
   */
  private generateDenseCandidates(bbox: any): Point[] {
    const positions: Point[] = [];

    if (this.placements.length === 0) {
      // First item: try bottom-left corner and a few other spots
      const step = 0.05;
      for (let y = -bbox.minY; y <= Math.min(this.sheetHeight - bbox.maxY, 2); y += step) {
        for (let x = -bbox.minX; x <= Math.min(this.sheetWidth - bbox.maxX, 2); x += step) {
          positions.push({ x, y });
        }
      }
      return positions.slice(0, 100);
    }

    // Subsequent items: dense grid around placed items + sparse global grid
    const placedBounds: any[] = [];

    for (const placement of this.placements) {
      const pBbox = GeometryUtils.getPolygonBounds(placement.points);
      placedBounds.push(pBbox);

      // Sample densely around this placement
      const searchRadius = Math.max(bbox.width, bbox.height);
      const step = 0.05; // 0.05" = very fine

      // Sample in a region around the placed item
      const minX = Math.max(-bbox.minX, pBbox.minX - searchRadius);
      const maxX = Math.min(this.sheetWidth - bbox.maxX, pBbox.maxX + searchRadius);
      const minY = Math.max(-bbox.minY, pBbox.minY - searchRadius);
      const maxY = Math.min(this.sheetHeight - bbox.maxY, pBbox.maxY + searchRadius);

      for (let y = minY; y <= maxY; y += step) {
        for (let x = minX; x <= maxX; x += step) {
          positions.push({ x, y });
        }
      }
    }

    // Also add sparse global grid to find isolated spots
    const globalStep = 0.25;
    for (let y = -bbox.minY; y <= this.sheetHeight - bbox.maxY; y += globalStep) {
      for (let x = -bbox.minX; x <= this.sheetWidth - bbox.maxX; x += globalStep) {
        positions.push({ x, y });
      }
    }

    // Remove duplicates (simple approach: round to grid)
    const seen = new Set<string>();
    const unique = positions.filter(p => {
      const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by score (bottom-first, then left)
    unique.sort((a, b) => (a.y * 100 + a.x) - (b.y * 100 + b.x));

    // Return top candidates
    return unique.slice(0, 2000); // Test up to 2000 positions
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

    // Sort by area descending (big items first)
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
